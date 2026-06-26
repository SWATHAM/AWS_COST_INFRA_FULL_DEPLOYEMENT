# AWS Cost Estimator — DevOps Infrastructure

A full-stack AWS Cost Estimator application deployed on EKS with automated CI/CD, centralized monitoring, and infrastructure-as-code.

**Stack:** React (frontend) · FastAPI/Python (backend) · EKS · Terraform · GitHub Actions · Prometheus + Grafana

---

## Architecture Overview

```
Internet
    │
    ▼
[AWS ALB Ingress]          ← managed by AWS Load Balancer Controller
    │
    ├─── /      ──► [Frontend Pods × 2]   (React + nginx, port 80)
    │
    └─── /api   ──► [Backend Pods × 2]    (FastAPI, port 8000)
                          │
                          ▼
                    [RDS PostgreSQL]       ← private subnet, encrypted
                    
[Prometheus] ◄── scrape ── All pods (annotations)
[Grafana]    ◄── query ─── Prometheus
```

**AWS Resources provisioned by Terraform:**
- VPC with 3 public + 3 private subnets across 3 AZs
- NAT Gateway for private subnet egress
- EKS cluster (Kubernetes 1.29) with managed node group (t3.medium × 2–5)
- RDS PostgreSQL 15.4 (db.t3.micro, encrypted, automated backups)
- ECR repositories for backend and frontend images

---

## Repository Structure

```
├── backend/                  # FastAPI Python application
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React application
│   ├── src/
│   ├── public/
│   ├── nginx.conf
│   ├── package.json
│   └── Dockerfile
├── terraform/                # Infrastructure as Code
│   ├── main.tf               # VPC, EKS, RDS, ECR
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── k8s/                      # Kubernetes manifests
│   ├── 00-namespace.yaml
│   ├── 01-backend.yaml       # Deployment, Service, HPA
│   ├── 02-frontend.yaml      # Deployment, Service, Ingress
│   └── 03-secrets.yaml.template
├── monitoring/               # Prometheus + Grafana
│   ├── prometheus.yml
│   ├── alert_rules.yml
│   └── grafana/
│       ├── datasources/
│       └── dashboards/       # 2 pre-built dashboards (JSON)
├── tests/
│   └── test_backend.py
├── .github/workflows/
│   └── ci-cd.yml             # Full CI/CD pipeline
└── docker-compose.yml        # Local development
```

---

## Local Development

```bash
# Clone repo
git clone https://github.com/<your-username>/aws-cost-estimator.git
cd aws-cost-estimator

# Start all services (app + monitoring)
docker-compose up --build

# Access:
#   Frontend:   http://localhost:80
#   Backend:    http://localhost:8000
#   Prometheus: http://localhost:9090
#   Grafana:    http://localhost:3001  (admin / admin123)
```

---

## Infrastructure Setup

### Prerequisites
- AWS CLI configured (`aws configure`)
- Terraform >= 1.5.0
- kubectl >= 1.29
- Docker

### 1. Configure AWS CLI

```bash
aws configure
# Enter: Access Key ID, Secret Access Key, region (us-east-1), output format (json)
```

### 2. Provision Infrastructure

```bash
cd terraform

# Copy and fill in your values
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set db_username and db_password

# Initialize
terraform init

# Preview changes
terraform plan

# Apply (takes ~20 minutes for EKS)
terraform apply
```

### 3. Configure kubectl

```bash
aws eks update-kubeconfig \
  --name aws-cost-estimator-eks \
  --region us-east-1
  
kubectl get nodes   # verify cluster is healthy
```

### 4. Install AWS Load Balancer Controller

```bash
# Required for Ingress → ALB creation
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=aws-cost-estimator-eks \
  --set serviceAccount.create=true
```

### 5. Deploy Monitoring Stack

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f monitoring/prometheus.yml
```

---

## CI/CD Pipeline

The pipeline (`.github/workflows/ci-cd.yml`) runs on every push:

| Step | Trigger | What Happens |
|------|---------|--------------|
| Test | All PRs + pushes | pytest (backend), npm test + build (frontend) |
| Build & Push | Push to `main` or `staging` | Docker build → ECR |
| Deploy Staging | Push to `staging` | `kubectl apply` → staging namespace |
| Smoke Test | After staging deploy | curl health check |
| Deploy Production | Push to `main` | Manual approval → deploy → rollback on failure |

### Required GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Your IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM user secret key |
| `DATABASE_URL` | `postgresql://user:pass@rds-endpoint:5432/awscostdb` |

---

## Monitoring & Dashboards

Two Grafana dashboards are provisioned automatically:

**1. Application Metrics** (`/dashboards/application.json`)
- Request rate per endpoint
- HTTP error rate (%) with threshold alerts
- P50/P95 response latency
- Active pod count & restart counter

**2. Infrastructure Metrics** (`/dashboards/infrastructure.json`)
- Node CPU and memory usage (%)
- Pod count by deployment
- Network I/O (bytes/s)
- Disk usage per mount point

Access Grafana:
```bash
# Port-forward to local machine
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
# Open: http://localhost:3000  (admin / prom-operator)
```

---

## Security Considerations

- **No hardcoded secrets** — all credentials injected via Kubernetes Secrets and GitHub Actions secrets
- **Private subnets** — backend pods and RDS are in private subnets; only the ALB is public
- **Encrypted storage** — RDS uses `storage_encrypted = true`; EBS volumes are encrypted
- **Container security** — backend runs as non-root (`runAsUser: 1000`), with `readOnlyRootFilesystem`
- **ECR image scanning** — `scan_on_push = true` on both ECR repos
- **Least-privilege IAM** — IRSA (IAM Roles for Service Accounts) scopes permissions per pod
- **Network policies** — RDS security group only allows inbound from EKS node security group

---

## Teardown

```bash
# Remove K8s resources
kubectl delete namespace aws-cost-estimator

# Destroy AWS infrastructure
cd terraform
terraform destroy
```
