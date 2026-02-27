# VaultPilot — Unified Credential & Secrets Lifecycle Management

> **"Never worry about a leaked or expired key again — rotate, validate, and stay compliant from one dashboard."**

## 🎯 The Problem

Modern companies juggle hundreds of credentials — AWS IAM keys, DB passwords, API tokens, SMTP logins — all expiring, scattered, and often never rotated. Manual rotation breaks systems and fails audits. Enterprise tools cost millions.

## 💡 The Solution

**VaultPilot** automates **Discovery → Rotation → Storage → Reload → Audit** across every environment. Zero-downtime key refreshes, compliance dashboards, and simple DevOps integration.

## 🏗️ Architecture

- **Frontend**: React + Tailwind CSS dashboard
- **Backend**: AWS Lambda microservices (Discovery, Rotation, Audit)
- **Database**: DynamoDB (metadata) + SSM/Secrets Manager (secrets)
- **Auth**: AWS Cognito
- **Infra**: Terraform + CloudFormation

## 📁 Project Structure

```
vaultpilot_chatgpt/
├── frontend/          # React dashboard (Dashboard, Credentials, Audit, Settings, AWS Accounts)
├── backend/           # Lambda: discovery, rotation, accounts, api
├── infra/             # Terraform + CloudFormation
├── docs/              # Architecture, API, deployment guides
└── HACKATHON_PRESENTATION_GUIDE.md  # Pitch & demo guide
```

## 🚀 Quick Start

```bash
# Frontend
cd frontend && npm install && npm start

# Backend (per Lambda)
cd backend/rotation && npm install && npx serverless deploy
cd backend/discovery && npm install && npx serverless deploy
```

## 📊 Features

| Feature | Description |
|---------|-------------|
| **Discovery** | Scan AWS (IAM, Secrets Manager, SSM) for credentials |
| **Rotation** | Auto-rotate IAM, DB, SMTP, API tokens — zero downtime |
| **Audit** | Full trail for SOC2, ISO 27001 compliance |
| **Multi-tenant** | AWS account connection, per-tenant isolation |

## 💰 Pricing Model

- **Free**: 5 secrets, alerts only
- **Pro**: 25 secrets, email + Slack ($29/month)
- **Business**: 100 secrets, multi-cloud ($99/month)
- **Enterprise**: Unlimited + on-prem ($299/month)

## 📖 Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Hackathon Presentation Guide](HACKATHON_PRESENTATION_GUIDE.md)

---

© VaultPilot — Credential lifecycle management for modern teams.
