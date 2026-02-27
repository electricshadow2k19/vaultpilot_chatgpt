# VaultPilot — How to Access & Run

## Option 1: Try the Deployed URL (Original vaultpilot)

The original vaultpilot frontend was deployed to AWS S3. Try this URL:

**http://vaultpilot-frontend-dev-97123192.s3-website-us-east-1.amazonaws.com**

> ⚠️ **Note:** This URL may no longer work if the S3 bucket was deleted or the AWS account/resources were cleaned up. If you get an error, use Option 2.

---

## Option 2: Run Locally (Recommended)

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Steps

```bash
# Navigate to frontend
cd vaultpilot_chatgpt/frontend

# Install dependencies
npm install

# Start development server
npm start
```

The app will open at **http://localhost:3000** in your browser.

### What You'll See
- **Dashboard** — Stats, charts, credential overview (mock data)
- **Credentials** — List of credentials with status
- **Audit** — Audit log trail
- **Settings** — Rotation policies, notifications
- **AWS Accounts** — Multi-tenant account connection UI

The frontend uses mock data when the backend API is unavailable, so the UI is fully demoable.

---

## Option 3: Deploy to AWS S3 (New Deployment)

If you want a public URL for your vaultpilot_chatgpt deployment:

```bash
cd vaultpilot_chatgpt/frontend

# Build
npm run build

# Deploy (requires AWS CLI configured)
aws s3 mb s3://vaultpilot-chatgpt-frontend --region us-east-1
aws s3 website s3://vaultpilot-chatgpt-frontend --index-document index.html --error-document index.html
aws s3 sync build/ s3://vaultpilot-chatgpt-frontend --delete
```

Then enable static website hosting and access via:
**http://vaultpilot-chatgpt-frontend.s3-website-us-east-1.amazonaws.com**

---

## API Endpoints (Backend)

The frontend is configured to call:
- **Main API:** https://t9abv3wghl.execute-api.us-east-1.amazonaws.com
- **Rotation API:** https://nh9vt3pbta.execute-api.us-east-1.amazonaws.com/prod

### Real-Time Audit Logs

The Audit page now fetches **real logs** from DynamoDB (no mock data). To enable:

1. **Deploy the audit API** — The `/audit` endpoint is included in:
   - **Serverless:** `cd backend/accounts && npx serverless deploy`
   - **CloudFormation:** Update `infra/accounts-api-stack.yaml` (includes GET /audit route)

2. **Ensure the audit table exists** — `vaultpilot-audit-logs-prod` (or `-dev` in dev)

3. **Logs are populated when you:**
   - Add/update/delete AWS accounts
   - Run account scans (Discover credentials)
   - Rotate credentials
   - Run discovery

4. **Auto-refresh:** The Audit page polls every 15 seconds for real-time updates.
