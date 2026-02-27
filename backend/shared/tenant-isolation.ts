/**
 * Multi-Tenant Isolation Module
 * Ensures strict isolation between tenants
 */

import { DynamoDB } from 'aws-sdk';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';

const dynamodb = new DynamoDB.DocumentClient();

export interface TenantContext {
  tenantId: string;
  userId: string;
  email: string;
  plan: 'free' | 'pro' | 'business' | 'enterprise';
  permissions: string[];
}

export interface PlanLimits {
  maxCredentials: number;
  maxRotationsPerMonth: number;
  features: string[];
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxCredentials: 5,
    maxRotationsPerMonth: 10,
    features: ['basic_rotation', 'email_alerts']
  },
  pro: {
    maxCredentials: 25,
    maxRotationsPerMonth: 100,
    features: ['basic_rotation', 'email_alerts', 'slack_alerts', 'scheduled_rotation']
  },
  business: {
    maxCredentials: 100,
    maxRotationsPerMonth: 500,
    features: ['basic_rotation', 'email_alerts', 'slack_alerts', 'scheduled_rotation', 'multi_cloud', 'api_access']
  },
  enterprise: {
    maxCredentials: -1, // unlimited
    maxRotationsPerMonth: -1, // unlimited
    features: ['all']
  }
};

/**
 * Extract tenant context from API Gateway event
 */
export function extractTenantContext(event: APIGatewayProxyEvent): TenantContext | null {
  try {
    // Get JWT token from Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      console.error('No Authorization header found');
      return null;
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Decode JWT token (in production, verify signature)
    const decoded = jwt.decode(token) as any;
    if (!decoded) {
      console.error('Failed to decode JWT token');
      return null;
    }
    
    // Extract tenant information from token
    const tenantId = decoded['custom:tenant_id'] || decoded.sub;
    const userId = decoded.sub;
    const email = decoded.email;
    const plan = decoded['custom:plan'] || 'free';
    const permissions = decoded['custom:permissions']?.split(',') || [];
    
    return {
      tenantId,
      userId,
      email,
      plan: plan as 'free' | 'pro' | 'business' | 'enterprise',
      permissions
    };
  } catch (error) {
    console.error('Failed to extract tenant context:', error);
    return null;
  }
}

/**
 * Validate tenant has access to resource
 */
export async function validateTenantAccess(
  tenantContext: TenantContext,
  resourceId: string,
  resourceType: string
): Promise<boolean> {
  try {
    // Get resource from DynamoDB
    const result = await dynamodb.get({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      Key: { id: resourceId }
    }).promise();
    
    if (!result.Item) {
      console.error(`Resource ${resourceId} not found`);
      return false;
    }
    
    // Check if resource belongs to tenant
    if (result.Item.tenantId !== tenantContext.tenantId) {
      console.error(`Resource ${resourceId} does not belong to tenant ${tenantContext.tenantId}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to validate tenant access:`, error);
    return false;
  }
}

/**
 * Get plan limits for tenant
 */
export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Check if tenant has reached credential limit
 */
export async function checkCredentialLimit(tenantContext: TenantContext): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  try {
    const limits = getPlanLimits(tenantContext.plan);
    
    // Count current credentials for tenant
    const result = await dynamodb.query({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      IndexName: 'tenantId-index',
      KeyConditionExpression: 'tenantId = :tenantId',
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantContext.tenantId,
        ':type': 'credential'
      }
    }).promise();
    
    const currentCount = result.Count || 0;
    const limit = limits.maxCredentials;
    
    // -1 means unlimited
    const allowed = limit === -1 || currentCount < limit;
    
    return {
      allowed,
      current: currentCount,
      limit
    };
  } catch (error) {
    console.error(`Failed to check credential limit:`, error);
    return {
      allowed: false,
      current: 0,
      limit: 0
    };
  }
}

/**
 * Check if tenant has reached rotation limit for current month
 */
export async function checkRotationLimit(tenantContext: TenantContext): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  try {
    const limits = getPlanLimits(tenantContext.plan);
    
    // Get start of current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // Count rotations this month for tenant
    const result = await dynamodb.query({
      TableName: process.env.DYNAMODB_TABLE || 'vaultpilot-credentials-dev',
      IndexName: 'tenantId-timestamp-index',
      KeyConditionExpression: 'tenantId = :tenantId AND #timestamp >= :monthStart',
      FilterExpression: '#type = :type AND #status = :status',
      ExpressionAttributeNames: {
        '#type': 'type',
        '#status': 'status',
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantContext.tenantId,
        ':type': 'rotation_attempt',
        ':status': 'success',
        ':monthStart': monthStart
      }
    }).promise();
    
    const currentCount = result.Count || 0;
    const limit = limits.maxRotationsPerMonth;
    
    // -1 means unlimited
    const allowed = limit === -1 || currentCount < limit;
    
    return {
      allowed,
      current: currentCount,
      limit
    };
  } catch (error) {
    console.error(`Failed to check rotation limit:`, error);
    return {
      allowed: false,
      current: 0,
      limit: 0
    };
  }
}

/**
 * Check if tenant has access to feature
 */
export function checkFeatureAccess(tenantContext: TenantContext, feature: string): boolean {
  const limits = getPlanLimits(tenantContext.plan);
  
  // Enterprise has access to all features
  if (limits.features.includes('all')) {
    return true;
  }
  
  return limits.features.includes(feature);
}

/**
 * Add tenant ID to all DynamoDB operations
 */
export function addTenantFilter(
  params: any,
  tenantContext: TenantContext
): any {
  // Add tenant ID to the item
  if (params.Item) {
    params.Item.tenantId = tenantContext.tenantId;
    params.Item.createdBy = tenantContext.userId;
  }
  
  // Add tenant filter to queries
  if (params.KeyConditionExpression) {
    params.KeyConditionExpression += ' AND tenantId = :tenantId';
    params.ExpressionAttributeValues = {
      ...params.ExpressionAttributeValues,
      ':tenantId': tenantContext.tenantId
    };
  }
  
  // Add tenant filter to scans
  if (params.FilterExpression) {
    params.FilterExpression += ' AND tenantId = :tenantId';
    params.ExpressionAttributeValues = {
      ...params.ExpressionAttributeValues,
      ':tenantId': tenantContext.tenantId
    };
  } else {
    params.FilterExpression = 'tenantId = :tenantId';
    params.ExpressionAttributeValues = {
      ...params.ExpressionAttributeValues,
      ':tenantId': tenantContext.tenantId
    };
  }
  
  return params;
}

/**
 * Validate request has proper tenant context
 */
export function validateRequest(event: APIGatewayProxyEvent): {
  valid: boolean;
  tenantContext?: TenantContext;
  error?: string;
} {
  const tenantContext = extractTenantContext(event);
  
  if (!tenantContext) {
    return {
      valid: false,
      error: 'Invalid or missing authentication token'
    };
  }
  
  return {
    valid: true,
    tenantContext
  };
}

/**
 * Create error response for tenant isolation violations
 */
export function createIsolationViolationResponse() {
  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      error: 'Access Denied',
      message: 'You do not have permission to access this resource'
    })
  };
}

/**
 * Create error response for plan limit violations
 */
export function createPlanLimitResponse(limitType: string, current: number, limit: number) {
  return {
    statusCode: 402, // Payment Required
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      error: 'Plan Limit Reached',
      message: `You have reached your plan limit for ${limitType}`,
      current,
      limit,
      action: 'Please upgrade your plan to continue'
    })
  };
}
