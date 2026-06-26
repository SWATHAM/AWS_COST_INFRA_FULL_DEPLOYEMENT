# AWS Cost Estimator — DevOps Infrastructure

A full-stack AWS Cost Estimator application deployed on EKS with automated CI/CD, centralized monitoring, and infrastructure-as-code.

**Stack:** React (frontend) · FastAPI/Python (backend) · EKS · Terraform · GitHub Actions · Prometheus + Grafana

---

## Architecture Overview

```
Internet
    |
    v
[AWS ALB]                  <- Ingress, routes to pods in public subnets
    |
    +--- /        --> [Frontend pod]   (React build served by nginx, port 80)
    |
    +--- /api     --> [Backend pod]    (FastAPI, port 8000)
                            |
                            v
                      [RDS PostgreSQL 15]   <- private subnet, EKS security group only

[Prometheus] <-- scrapes /metrics every 15s -- [Backend]
[Grafana]    <-- queries -- [Prometheus]
```

EKS, RDS, and the worker nodes all sit in private subnets across 3 AZs in `us-east-1`. The ALB is the only public-facing piece. A NAT Gateway gives the private subnets outbound internet access (for pulling base images, hitting AWS APIs, etc).

**AWS resources provisioned by Terraform:**
- VPC — 10.0.0.0/16, 3 public + 3 private subnets across 3 AZs
- EKS cluster — Kubernetes **1.32**, managed node group on **t3.micro** (2 nodes, free-tier eligible)
- RDS PostgreSQL 15 — `db.t3.micro`, free-tier compatible (`backup_retention_period = 0`, `storage_encrypted = false`, `monitoring_interval = 0`)
- ECR — one repo for backend, one for frontend, `scan_on_push = true`
- Security groups — RDS only accepts inbound from the EKS node security group
- IAM — IRSA for pod-level AWS permissions

---

## Repository Structure

```
final-repo/
├── backend/                  # FastAPI Python application
│   ├── main.py               # includes prometheus-fastapi-instrumentator /metrics
│   ├── requirements.txt
│   └── Dockerfile            # python:3.12-slim base, non-root appuser
├── frontend/                 # React application
│   ├── src/
│   ├── public/
│   ├── nginx.conf            # proxies /api/ to the backend
│   ├── package.json
│   └── Dockerfile            # 2-stage build: node -> nginx
├── terraform/                # Infrastructure as code
│   ├── main.tf                # VPC, EKS, RDS, ECR
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── k8s/                      # Kubernetes manifests
│   ├── 00-namespace.yaml     # aws-cost-estimator namespace
│   ├── 01-backend.yaml       # Deployment, Service, HPA
│   ├── 02-frontend.yaml      # Deployment, Service, Ingress
│   └── 03-secrets.yaml.template
├── monitoring/                # Prometheus + Grafana
│   ├── prometheus.yml
│   └── grafana/
│       └── dashboards/        # application.json, infrastructure.json
├── tests/
│   └── test_backend.py        # 6 pytest cases: health, estimate, CORS
├── .github/workflows/
│   └── ci-cd.yml               # test -> build -> push -> deploy
└── docker-compose.yml          # local dev: app + monitoring stack
```

---

## Running locally

Prerequisites: Docker Desktop.

```bash
git clone https://github.com/SWATHAM/AWS_COST_INFRA_FULL_DEPLOYEMENT
cd AWS_COST_INFRA_FULL_DEPLOYEMENT/final-repo
docker-compose up --build
```

| Service | URL |
|---|---|
| App (frontend) | http://localhost:3000 |
| API (backend) | http://localhost:8000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin123) |

`docker-compose` runs the frontend, backend, Prometheus, Grafana, and node-exporter together. nginx inside the frontend container proxies `/api/` to `http://backend:8000/` — this is the Docker Compose service name, not the Kubernetes one (see [CHALLENGES.md](./CHALLENGES.md), challenge #2).

---

## Deploying to AWS

Prerequisites: AWS CLI configured, Terraform installed, kubectl installed.

### 1. Provision infrastructure

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # fill in db credentials etc — gitignored
terraform init
terraform plan
terraform apply        # ~20 minutes, mostly waiting on the EKS control plane
```

### 2. Point kubectl at the new cluster

```bash
aws eks update-kubeconfig --name aws-cost-estimator-eks --region us-east-1
kubectl get nodes        # confirm nodes are Ready
```

### 3. Deploy the app

```bash
kubectl apply -f k8s/
kubectl get pods -n aws-cost-estimator        # wait for Running
kubectl get ingress app-ingress -n aws-cost-estimator   # get the public ALB URL
```

The `ADDRESS` column on the Ingress gives you a URL like `k8s-awscoste-appingre-xxxx.us-east-1.elb.amazonaws.com` — that's the public entry point.

### Teardown

```bash
kubectl delete namespace aws-cost-estimator
cd terraform
terraform destroy
```

---

## CI/CD pipeline

`.github/workflows/ci-cd.yml` runs 4 jobs on every push to `main`:

| Job | What it does | Trigger |
|---|---|---|
| `test-backend` | pytest — 6 tests (health, estimate, CORS) | every push |
| `test-frontend` | npm install + npm test + npm run build | every push |
| `build-and-push` | `docker buildx --platform linux/amd64`, push to ECR | push to main/staging |
| `deploy-production` | `kubectl apply` to EKS, waits for pods Running | push to main |

The `--platform linux/amd64` flag matters: images built on an Apple Silicon Mac default to ARM, but EKS nodes run AMD64 — without this flag the deploy succeeds but pods crash with `exec format error` (see CHALLENGES.md #7). On failure, the pipeline runs `kubectl rollout undo` automatically.

**Required GitHub Secrets** (Settings -> Secrets and variables -> Actions):

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `DATABASE_URL` | `postgresql://dbadmin:<password>@<rds-endpoint>:5432/awscostdb` |

---

## Monitoring

Prometheus scrapes the backend's `/metrics` endpoint (added via `prometheus-fastapi-instrumentator`) every 15 seconds. Two Grafana dashboards are pre-provisioned:

**Application metrics** (`monitoring/grafana/dashboards/application.json`)
- Request rate (req/s) per endpoint
- Error rate (% of 5xx responses)
- P50 / P95 response latency
- Total request counter, backend uptime

**Infrastructure metrics** (`monitoring/grafana/dashboards/infrastructure.json`)
- Node CPU / memory usage (from node-exporter)
- Network I/O (bytes/s)
- Disk usage
- System load average (1m, 5m)

If a dashboard panel shows "No data" locally, it's almost always because a query is targeting `kube_*` metrics that only exist on a real cluster — see CHALLENGES.md #9.

---

## Security considerations

- No secrets in code — credentials live in GitHub Actions Secrets and Kubernetes Secrets
- Private subnets — backend pods and RDS are not directly reachable from the internet
- RDS security group only accepts inbound from the EKS node security group
- Non-root containers — backend runs as `appuser` (UID 1000)
- ECR image scanning on push (`scan_on_push = true`)
- IRSA — IAM Roles for Service Accounts scopes AWS permissions per pod, not per node
- `terraform.tfvars` is gitignored — database passwords never committed

---

## Notes on free-tier choices

A few things in this setup are deliberately scoped down to stay inside the AWS free tier rather than reflecting production best practice:

- RDS: `backup_retention_period = 0`, `storage_encrypted = false`, `monitoring_interval = 0` — free tier RDS rejects backup retention above 0
- EKS nodes: `t3.micro` rather than `t3.medium` — `t3.medium` is not free-tier eligible
- Frontend/backend deployment strategy is `Recreate` rather than `RollingUpdate` — at `t3.micro` size, two nodes can only fit ~4 pods each, and a rolling update needs old + new pods running simultaneously, which doesn't fit

In a real production environment these would be reverted (encrypted storage, backup retention > 0, RollingUpdate with more headroom).
