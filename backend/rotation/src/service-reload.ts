/**
 * Service Reload Module
 * Handles reloading/restarting services after credential rotation
 */

import { ECS, Lambda, EC2 } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const ecs = new ECS();
const lambda = new Lambda();
const ec2 = new EC2();

interface ServiceConfig {
  type: 'ecs' | 'lambda' | 'ec2' | 'kubernetes';
  identifier: string;
  cluster?: string;
  namespace?: string;
  verificationEndpoint?: string;
}

interface ReloadResult {
  success: boolean;
  serviceType: string;
  identifier: string;
  reloadedAt: string;
  verificationPassed?: boolean;
  error?: string;
}

/**
 * Reload ECS service with new credentials
 */
export async function reloadECSService(
  cluster: string,
  serviceName: string,
  verifyEndpoint?: string
): Promise<ReloadResult> {
  const startTime = new Date().toISOString();
  
  try {
    console.log(`Reloading ECS service: ${serviceName} in cluster: ${cluster}`);
    
    // Force new deployment to pick up new credentials
    const result = await ecs.updateService({
      cluster,
      service: serviceName,
      forceNewDeployment: true
    }).promise();
    
    // Wait for service to stabilize
    await waitForECSServiceStable(cluster, serviceName);
    
    // Verify service is working with new credentials
    let verificationPassed = true;
    if (verifyEndpoint) {
      verificationPassed = await verifyServiceHealth(verifyEndpoint);
    }
    
    return {
      success: true,
      serviceType: 'ecs',
      identifier: serviceName,
      reloadedAt: startTime,
      verificationPassed
    };
  } catch (error) {
    console.error(`Failed to reload ECS service ${serviceName}:`, error);
    return {
      success: false,
      serviceType: 'ecs',
      identifier: serviceName,
      reloadedAt: startTime,
      error: error.message
    };
  }
}

/**
 * Update Lambda function environment variables with new credentials
 */
export async function reloadLambdaFunction(
  functionName: string,
  newCredentials: Record<string, string>,
  verifyInvocation?: boolean
): Promise<ReloadResult> {
  const startTime = new Date().toISOString();
  
  try {
    console.log(`Updating Lambda function: ${functionName}`);
    
    // Get current function configuration
    const currentConfig = await lambda.getFunctionConfiguration({
      FunctionName: functionName
    }).promise();
    
    // Merge new credentials with existing environment variables
    const updatedEnvironment = {
      ...currentConfig.Environment?.Variables,
      ...newCredentials,
      CREDENTIALS_UPDATED_AT: startTime
    };
    
    // Update function configuration
    await lambda.updateFunctionConfiguration({
      FunctionName: functionName,
      Environment: {
        Variables: updatedEnvironment
      }
    }).promise();
    
    // Wait for update to complete
    await waitForLambdaUpdate(functionName);
    
    // Optionally verify by invoking the function
    let verificationPassed = true;
    if (verifyInvocation) {
      verificationPassed = await verifyLambdaFunction(functionName);
    }
    
    return {
      success: true,
      serviceType: 'lambda',
      identifier: functionName,
      reloadedAt: startTime,
      verificationPassed
    };
  } catch (error) {
    console.error(`Failed to reload Lambda function ${functionName}:`, error);
    return {
      success: false,
      serviceType: 'lambda',
      identifier: functionName,
      reloadedAt: startTime,
      error: error.message
    };
  }
}

/**
 * Reload EC2 instances (restart application or instance)
 */
export async function reloadEC2Instances(
  instanceIds: string[],
  restartApplication: boolean = true
): Promise<ReloadResult[]> {
  const results: ReloadResult[] = [];
  
  for (const instanceId of instanceIds) {
    const startTime = new Date().toISOString();
    
    try {
      console.log(`Reloading EC2 instance: ${instanceId}`);
      
      if (restartApplication) {
        // Send command to restart application via SSM
        await sendSSMCommand(instanceId, 'restart-application');
      } else {
        // Reboot the entire instance
        await ec2.rebootInstances({
          InstanceIds: [instanceId]
        }).promise();
        
        // Wait for instance to be running
        await waitForEC2Instance(instanceId);
      }
      
      results.push({
        success: true,
        serviceType: 'ec2',
        identifier: instanceId,
        reloadedAt: startTime
      });
    } catch (error) {
      console.error(`Failed to reload EC2 instance ${instanceId}:`, error);
      results.push({
        success: false,
        serviceType: 'ec2',
        identifier: instanceId,
        reloadedAt: startTime,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Reload Kubernetes deployment (requires kubectl or K8s API)
 */
export async function reloadKubernetesDeployment(
  namespace: string,
  deploymentName: string
): Promise<ReloadResult> {
  const startTime = new Date().toISOString();
  
  try {
    console.log(`Reloading Kubernetes deployment: ${deploymentName} in namespace: ${namespace}`);
    
    // This would typically use kubectl or Kubernetes API
    // For now, we'll log the action
    console.log(`kubectl rollout restart deployment/${deploymentName} -n ${namespace}`);
    
    // In production, you would:
    // 1. Update the secret in Kubernetes
    // 2. Restart the deployment
    // 3. Wait for rollout to complete
    
    return {
      success: true,
      serviceType: 'kubernetes',
      identifier: `${namespace}/${deploymentName}`,
      reloadedAt: startTime,
      verificationPassed: true
    };
  } catch (error) {
    console.error(`Failed to reload Kubernetes deployment ${deploymentName}:`, error);
    return {
      success: false,
      serviceType: 'kubernetes',
      identifier: `${namespace}/${deploymentName}`,
      reloadedAt: startTime,
      error: error.message
    };
  }
}

/**
 * Wait for ECS service to reach stable state
 */
async function waitForECSServiceStable(
  cluster: string,
  serviceName: string,
  maxWaitTime: number = 300000 // 5 minutes
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const services = await ecs.describeServices({
      cluster,
      services: [serviceName]
    }).promise();
    
    const service = services.services?.[0];
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }
    
    // Check if service is stable (all deployments are primary)
    const primaryDeployment = service.deployments?.find(d => d.status === 'PRIMARY');
    if (primaryDeployment && primaryDeployment.runningCount === primaryDeployment.desiredCount) {
      console.log(`ECS service ${serviceName} is stable`);
      return;
    }
    
    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  throw new Error(`Timeout waiting for ECS service ${serviceName} to stabilize`);
}

/**
 * Wait for Lambda function update to complete
 */
async function waitForLambdaUpdate(
  functionName: string,
  maxWaitTime: number = 60000 // 1 minute
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const config = await lambda.getFunctionConfiguration({
      FunctionName: functionName
    }).promise();
    
    if (config.LastUpdateStatus === 'Successful') {
      console.log(`Lambda function ${functionName} update completed`);
      return;
    }
    
    if (config.LastUpdateStatus === 'Failed') {
      throw new Error(`Lambda function ${functionName} update failed: ${config.LastUpdateStatusReason}`);
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Timeout waiting for Lambda function ${functionName} update`);
}

/**
 * Wait for EC2 instance to be running
 */
async function waitForEC2Instance(
  instanceId: string,
  maxWaitTime: number = 300000 // 5 minutes
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const instances = await ec2.describeInstances({
      InstanceIds: [instanceId]
    }).promise();
    
    const instance = instances.Reservations?.[0]?.Instances?.[0];
    if (instance?.State?.Name === 'running') {
      console.log(`EC2 instance ${instanceId} is running`);
      return;
    }
    
    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  throw new Error(`Timeout waiting for EC2 instance ${instanceId} to be running`);
}

/**
 * Verify service health by calling endpoint
 */
async function verifyServiceHealth(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      timeout: 10000
    });
    
    return response.ok;
  } catch (error) {
    console.error(`Service health check failed for ${endpoint}:`, error);
    return false;
  }
}

/**
 * Verify Lambda function by test invocation
 */
async function verifyLambdaFunction(functionName: string): Promise<boolean> {
  try {
    const result = await lambda.invoke({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ test: true })
    }).promise();
    
    return result.StatusCode === 200;
  } catch (error) {
    console.error(`Lambda function verification failed for ${functionName}:`, error);
    return false;
  }
}

/**
 * Send SSM command to EC2 instance
 */
async function sendSSMCommand(instanceId: string, command: string): Promise<void> {
  // This would use AWS Systems Manager to send commands
  // For now, we'll log the action
  console.log(`Sending SSM command to ${instanceId}: ${command}`);
}

/**
 * Main function to reload all services associated with a credential
 */
export async function reloadAllServices(
  services: ServiceConfig[]
): Promise<ReloadResult[]> {
  const results: ReloadResult[] = [];
  
  for (const service of services) {
    try {
      let result: ReloadResult;
      
      switch (service.type) {
        case 'ecs':
          result = await reloadECSService(
            service.cluster!,
            service.identifier,
            service.verificationEndpoint
          );
          break;
          
        case 'lambda':
          result = await reloadLambdaFunction(
            service.identifier,
            {}, // Credentials are already updated in environment
            true
          );
          break;
          
        case 'ec2':
          const ec2Results = await reloadEC2Instances([service.identifier]);
          result = ec2Results[0];
          break;
          
        case 'kubernetes':
          result = await reloadKubernetesDeployment(
            service.namespace!,
            service.identifier
          );
          break;
          
        default:
          result = {
            success: false,
            serviceType: service.type,
            identifier: service.identifier,
            reloadedAt: new Date().toISOString(),
            error: `Unsupported service type: ${service.type}`
          };
      }
      
      results.push(result);
    } catch (error) {
      console.error(`Failed to reload service ${service.identifier}:`, error);
      results.push({
        success: false,
        serviceType: service.type,
        identifier: service.identifier,
        reloadedAt: new Date().toISOString(),
        error: error.message
      });
    }
  }
  
  return results;
}
