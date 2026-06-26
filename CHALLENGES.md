# Challenges & Resolutions — DevOps Assignment

**Project:** AWS Cost Estimator  
**Candidate:** Swatha Manoharan  
**Role Applied:** DevOps Engineer — 8Byte.ai

---

## Challenge 1: EKS Node Group IAM Permissions for ECR Pull

**Challenge:**  
After provisioning the EKS cluster with Terraform, worker nodes were unable to pull Docker images from ECR, causing `ImagePullBackOff` errors on all pods.

**Root Cause:**  
The managed node group IAM role was missing the `AmazonEC2ContainerRegistryReadOnly` policy, which is required for nodes to authenticate against ECR.

**Resolution:**  
Added the policy attachment in Terraform:
```hcl
resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = module.eks.eks_managed_node_groups["general"].iam_role_name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}
```
Also verified the VPC endpoint for ECR was available in private subnets to avoid NAT costs for large image pulls.

---

## Challenge 2: React App Calling Backend Across Containers

**Challenge:**  
The React frontend was hardcoded to call `http://localhost:8000` for the backend API. Inside Docker/Kubernetes, `localhost` refers to the container itself — not the backend service — causing all API calls to fail with network errors.

**Root Cause:**  
Frontend was built with a static API URL baked in at compile time.

**Resolution:**  
Used environment variables injected at build time via `REACT_APP_API_URL`, and configured nginx to proxy `/api/` requests to the backend Kubernetes service:

```nginx
location /api/ {
    proxy_pass http://backend-service:8000/;
}
```

This allowed the frontend to call `/api/estimate` and have nginx route it internally — no CORS issues, no hardcoded IPs.

---

## Challenge 3: Kubernetes Ingress Not Getting an External IP

**Challenge:**  
After applying the Ingress manifest, `kubectl get ingress` showed `<pending>` indefinitely under the ADDRESS column.

**Root Cause:**  
The AWS Load Balancer Controller was not installed in the cluster. Without it, Kubernetes has no reconciler to create an ALB from the Ingress resource.

**Resolution:**  
Installed the AWS Load Balancer Controller via Helm and configured the necessary IRSA (IAM Role for Service Account) so the controller could create ALBs on our behalf:

```bash
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system --set clusterName=aws-cost-estimator-eks
```

Added subnet tags in Terraform (`kubernetes.io/role/elb = 1`) so the controller could discover which public subnets to place the ALB in.

---

## Challenge 4: GitHub Actions — kubectl Not Authenticated

**Challenge:**  
The CI/CD deploy job was failing with `error: You must be logged in to the server (Unauthorized)` when running `kubectl apply`.

**Root Cause:**  
The `aws eks update-kubeconfig` step was running, but the IAM user used in GitHub Actions secrets did not have the `eks:DescribeCluster` permission, and was also not in the `aws-auth` ConfigMap that EKS uses for RBAC.

**Resolution:**  
1. Added `eks:DescribeCluster` to the GitHub Actions IAM policy.
2. Patched the `aws-auth` ConfigMap to map the IAM user to `system:masters`:

```bash
kubectl edit configmap aws-auth -n kube-system
```

In production, this would use a dedicated CI/CD IAM role with scoped permissions rather than `system:masters`.

---

## Challenge 5: Prometheus Not Scraping FastAPI Metrics

**Challenge:**  
Prometheus was running but showed no metrics from the backend — the `/metrics` endpoint was returning a 404.

**Root Cause:**  
FastAPI does not expose a `/metrics` endpoint by default. Prometheus client libraries must be explicitly installed and a metrics route registered.

**Resolution:**  
Added `prometheus-fastapi-instrumentator` to `requirements.txt` and initialized it in `main.py`:

```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```

This auto-instruments all FastAPI routes and exposes `/metrics` in Prometheus exposition format.

---

## Happy Path Practices Followed

- **Rolling updates** with `maxUnavailable: 0` ensure zero downtime deployments
- **HPA (Horizontal Pod Autoscaler)** scales pods automatically under load
- **Automated rollback** in the CI pipeline on deploy failure (`kubectl rollout undo`)
- **Secrets never in git** — all credentials in GitHub Actions secrets and Kubernetes Secrets
- **Image scanning** on ECR push to catch vulnerabilities before they reach production
- **Multi-AZ RDS** and multi-AZ NAT Gateways in production for high availability
- **Terraform remote state** in S3 to support team collaboration safely
