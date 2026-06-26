from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json

app = FastAPI(title="AWS Cost Estimator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── AWS Pricing (USD/month approximations) ──────────────────────────────────

EC2_PRICING = {
    "t3.micro":   {"vcpu": 2,  "ram": 1,   "price": 8.47},
    "t3.small":   {"vcpu": 2,  "ram": 2,   "price": 16.93},
    "t3.medium":  {"vcpu": 2,  "ram": 4,   "price": 33.87},
    "t3.large":   {"vcpu": 2,  "ram": 8,   "price": 67.74},
    "t3.xlarge":  {"vcpu": 4,  "ram": 16,  "price": 135.49},
    "t3.2xlarge": {"vcpu": 8,  "ram": 32,  "price": 270.98},
    "t4g.micro":  {"vcpu": 2,  "ram": 1,   "price": 6.78},
    "t4g.small":  {"vcpu": 2,  "ram": 2,   "price": 13.54},
    "t4g.medium": {"vcpu": 2,  "ram": 4,   "price": 27.07},
    "t4g.large":  {"vcpu": 2,  "ram": 8,   "price": 54.14},
    "m5.large":   {"vcpu": 2,  "ram": 8,   "price": 87.60},
    "m5.xlarge":  {"vcpu": 4,  "ram": 16,  "price": 175.20},
    "m5.2xlarge": {"vcpu": 8,  "ram": 32,  "price": 350.40},
    "c5.large":   {"vcpu": 2,  "ram": 4,   "price": 77.40},
    "c5.xlarge":  {"vcpu": 4,  "ram": 8,   "price": 154.80},
    "r5.large":   {"vcpu": 2,  "ram": 16,  "price": 113.40},
    "r5.xlarge":  {"vcpu": 4,  "ram": 32,  "price": 226.80},
}

RDS_PRICING = {
    "db.t3.micro":   {"price": 15.33},
    "db.t3.small":   {"price": 30.66},
    "db.t3.medium":  {"price": 61.32},
    "db.t3.large":   {"price": 122.64},
    "db.m5.large":   {"price": 138.70},
    "db.m5.xlarge":  {"price": 277.40},
    "db.r5.large":   {"price": 175.20},
    "db.r5.xlarge":  {"price": 350.40},
}

RDS_ENGINES = {
    "mysql": 1.0, "postgres": 1.0,
    "oracle": 2.8, "sqlserver": 2.5,
    "aurora-mysql": 1.1, "aurora-postgres": 1.1,
}

LAMBDA_PRICE_PER_GB_SECOND = 0.0000166667
LAMBDA_PRICE_PER_REQUEST   = 0.0000002
LAMBDA_FREE_REQUESTS       = 1_000_000
LAMBDA_FREE_GB_SECONDS     = 400_000

S3_PRICE_PER_GB            = 0.023
S3_PRICE_PER_PUT           = 0.000005
S3_PRICE_PER_GET           = 0.0000004
S3_TRANSFER_OUT_PER_GB     = 0.09

EKS_CLUSTER_PRICE          = 72.0   # per month per cluster
EBS_GP3_PER_GB             = 0.08
EBS_GP2_PER_GB             = 0.10
EBS_IO1_PER_GB             = 0.125
ELB_PER_HOUR               = 0.008
ELB_PER_LCU                = 0.008
CLOUDFRONT_PER_GB          = 0.0085
CLOUDFRONT_PER_REQUEST     = 0.0000010


# ── Request models ───────────────────────────────────────────────────────────

class EC2Instance(BaseModel):
    instance_type: str
    count: int = 1
    region: str = "us-east-1"
    os: str = "linux"          # linux | windows
    tenancy: str = "shared"    # shared | dedicated
    usage_hours: float = 730   # hours/month

class RDSInstance(BaseModel):
    instance_type: str
    engine: str = "mysql"
    count: int = 1
    multi_az: bool = False
    storage_gb: int = 100
    storage_type: str = "gp2"

class LambdaConfig(BaseModel):
    requests_per_month: int = 1_000_000
    avg_duration_ms: float = 200
    memory_mb: int = 128

class S3Config(BaseModel):
    storage_gb: float = 100
    put_requests: int = 100_000
    get_requests: int = 1_000_000
    transfer_out_gb: float = 10

class EKSConfig(BaseModel):
    cluster_count: int = 1
    node_instance_type: str = "t3.medium"
    node_count: int = 3

class EBSConfig(BaseModel):
    volume_type: str = "gp3"   # gp3 | gp2 | io1
    size_gb: int = 100
    count: int = 1

class ELBConfig(BaseModel):
    count: int = 1
    lcu_per_hour: float = 1.0

class CloudFrontConfig(BaseModel):
    transfer_out_gb: float = 100
    requests_per_month: int = 10_000_000

class EstimateRequest(BaseModel):
    ec2_instances: Optional[List[EC2Instance]] = []
    rds_instances: Optional[List[RDSInstance]] = []
    lambda_config: Optional[LambdaConfig] = None
    s3_config: Optional[S3Config] = None
    eks_config: Optional[EKSConfig] = None
    ebs_config: Optional[EBSConfig] = None
    elb_config: Optional[ELBConfig] = None
    cloudfront_config: Optional[CloudFrontConfig] = None


# ── Cost calculation logic ───────────────────────────────────────────────────

def calc_ec2(instances: List[EC2Instance]) -> dict:
    total = 0.0
    breakdown = []
    for inst in instances:
        base = EC2_PRICING.get(inst.instance_type, {}).get("price", 0)
        windows_mult = 1.4 if inst.os == "windows" else 1.0
        dedicated_mult = 1.3 if inst.tenancy == "dedicated" else 1.0
        usage_mult = inst.usage_hours / 730
        unit_cost = base * windows_mult * dedicated_mult * usage_mult
        cost = unit_cost * inst.count
        total += cost
        breakdown.append({
            "type": inst.instance_type,
            "count": inst.count,
            "unit_cost": round(unit_cost, 2),
            "total_cost": round(cost, 2),
            "vcpu": EC2_PRICING.get(inst.instance_type, {}).get("vcpu", 0),
            "ram_gb": EC2_PRICING.get(inst.instance_type, {}).get("ram", 0),
        })
    return {"total": round(total, 2), "breakdown": breakdown}

def calc_rds(instances: List[RDSInstance]) -> dict:
    total = 0.0
    breakdown = []
    for inst in instances:
        base = RDS_PRICING.get(inst.instance_type, {}).get("price", 0)
        engine_mult = RDS_ENGINES.get(inst.engine, 1.0)
        az_mult = 2.0 if inst.multi_az else 1.0
        storage_price = {
            "gp2": 0.115, "gp3": 0.115, "io1": 0.125
        }.get(inst.storage_type, 0.115) * inst.storage_gb
        unit_cost = (base * engine_mult * az_mult) + storage_price
        cost = unit_cost * inst.count
        total += cost
        breakdown.append({
            "type": inst.instance_type,
            "engine": inst.engine,
            "count": inst.count,
            "multi_az": inst.multi_az,
            "storage_gb": inst.storage_gb,
            "unit_cost": round(unit_cost, 2),
            "total_cost": round(cost, 2),
        })
    return {"total": round(total, 2), "breakdown": breakdown}

def calc_lambda(cfg: LambdaConfig) -> dict:
    billable_requests = max(0, cfg.requests_per_month - LAMBDA_FREE_REQUESTS)
    gb_seconds = (cfg.requests_per_month * cfg.avg_duration_ms / 1000) * (cfg.memory_mb / 1024)
    billable_gb_seconds = max(0, gb_seconds - LAMBDA_FREE_GB_SECONDS)
    compute_cost = billable_gb_seconds * LAMBDA_PRICE_PER_GB_SECOND
    request_cost = billable_requests * LAMBDA_PRICE_PER_REQUEST
    total = compute_cost + request_cost
    return {
        "total": round(total, 2),
        "compute_cost": round(compute_cost, 2),
        "request_cost": round(request_cost, 2),
        "gb_seconds": round(gb_seconds, 2),
    }

def calc_s3(cfg: S3Config) -> dict:
    storage_cost   = cfg.storage_gb * S3_PRICE_PER_GB
    put_cost       = cfg.put_requests * S3_PRICE_PER_PUT
    get_cost       = cfg.get_requests * S3_PRICE_PER_GET
    transfer_cost  = cfg.transfer_out_gb * S3_TRANSFER_OUT_PER_GB
    total = storage_cost + put_cost + get_cost + transfer_cost
    return {
        "total": round(total, 2),
        "storage_cost": round(storage_cost, 2),
        "put_cost": round(put_cost, 2),
        "get_cost": round(get_cost, 2),
        "transfer_cost": round(transfer_cost, 2),
    }

def calc_eks(cfg: EKSConfig) -> dict:
    cluster_cost = cfg.cluster_count * EKS_CLUSTER_PRICE
    node_price = EC2_PRICING.get(cfg.node_instance_type, {}).get("price", 0)
    node_cost = node_price * cfg.node_count * cfg.cluster_count
    total = cluster_cost + node_cost
    return {
        "total": round(total, 2),
        "cluster_cost": round(cluster_cost, 2),
        "node_cost": round(node_cost, 2),
    }

def calc_ebs(cfg: EBSConfig) -> dict:
    price_map = {"gp3": EBS_GP3_PER_GB, "gp2": EBS_GP2_PER_GB, "io1": EBS_IO1_PER_GB}
    per_gb = price_map.get(cfg.volume_type, EBS_GP3_PER_GB)
    total = per_gb * cfg.size_gb * cfg.count
    return {"total": round(total, 2), "per_gb_price": per_gb}

def calc_elb(cfg: ELBConfig) -> dict:
    hourly = cfg.count * ELB_PER_HOUR * 730
    lcu_cost = cfg.count * cfg.lcu_per_hour * ELB_PER_LCU * 730
    total = hourly + lcu_cost
    return {"total": round(total, 2), "hourly_cost": round(hourly, 2), "lcu_cost": round(lcu_cost, 2)}

def calc_cloudfront(cfg: CloudFrontConfig) -> dict:
    transfer_cost  = cfg.transfer_out_gb * CLOUDFRONT_PER_GB
    request_cost   = cfg.requests_per_month * CLOUDFRONT_PER_REQUEST
    total = transfer_cost + request_cost
    return {"total": round(total, 2), "transfer_cost": round(transfer_cost, 2), "request_cost": round(request_cost, 2)}

def generate_tips(breakdown: dict, total: float) -> list:
    tips = []
    ec2 = breakdown.get("ec2", {})
    for item in ec2.get("breakdown", []):
        if item["type"].startswith("t3.") and item["total_cost"] > 50:
            arm = item["type"].replace("t3.", "t4g.")
            saving = round(item["total_cost"] * 0.2, 2)
            tips.append({
                "service": "EC2",
                "severity": "high",
                "tip": f"Switch {item['count']}x {item['type']} → {arm} (ARM). Save ~${saving}/mo (20% cheaper).",
                "saving": saving,
            })
        if item["type"] in ("m5.large", "m5.xlarge") and item["count"] > 2:
            saving = round(item["total_cost"] * 0.15, 2)
            tips.append({
                "service": "EC2",
                "severity": "medium",
                "tip": f"Use Savings Plans or Reserved Instances for {item['count']}x {item['type']} — save up to 30%.",
                "saving": saving,
            })

    rds = breakdown.get("rds", {})
    for item in rds.get("breakdown", []):
        if item["multi_az"] and item["count"] == 1:
            tips.append({
                "service": "RDS",
                "severity": "low",
                "tip": f"Single {item['type']} with Multi-AZ enabled. Consider disabling Multi-AZ for dev/staging.",
                "saving": round(item["unit_cost"] * 0.5, 2),
            })
        if item["storage_gb"] > 500 and item.get("storage_type") == "io1":
            tips.append({
                "service": "RDS",
                "severity": "medium",
                "tip": "Migrate RDS storage from io1 → gp3 for same performance at 20% lower cost.",
                "saving": round(item["storage_gb"] * 0.01, 2),
            })

    if breakdown.get("s3", {}).get("transfer_cost", 0) > 50:
        tips.append({
            "service": "S3 + CloudFront",
            "severity": "high",
            "tip": "High S3 transfer cost detected. Put CloudFront in front of S3 — outbound via CDN is 85% cheaper.",
            "saving": round(breakdown["s3"]["transfer_cost"] * 0.7, 2),
        })

    if breakdown.get("lambda", {}).get("total", 0) == 0 and total > 500:
        tips.append({
            "service": "Architecture",
            "severity": "medium",
            "tip": "Consider offloading batch workloads to Lambda — pay only per execution, not 24/7.",
            "saving": 0,
        })

    if not tips:
        tips.append({
            "service": "General",
            "severity": "low",
            "tip": "Your setup looks optimized! Enable AWS Cost Anomaly Detection to catch unexpected spikes early.",
            "saving": 0,
        })

    return sorted(tips, key=lambda x: {"high": 0, "medium": 1, "low": 2}[x["severity"]])


# ── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "AWS Cost Estimator API", "version": "1.0.0", "docs": "/docs"}

@app.get("/services/ec2-types")
def get_ec2_types():
    return {"instance_types": list(EC2_PRICING.keys())}

@app.get("/services/rds-types")
def get_rds_types():
    return {"instance_types": list(RDS_PRICING.keys()), "engines": list(RDS_ENGINES.keys())}

@app.post("/estimate")
def estimate(req: EstimateRequest):
    breakdown = {}
    services_chart = []

    if req.ec2_instances:
        result = calc_ec2(req.ec2_instances)
        breakdown["ec2"] = result
        if result["total"] > 0:
            services_chart.append({"service": "EC2", "cost": result["total"], "color": "#FF9900"})

    if req.rds_instances:
        result = calc_rds(req.rds_instances)
        breakdown["rds"] = result
        if result["total"] > 0:
            services_chart.append({"service": "RDS", "cost": result["total"], "color": "#3F8624"})

    if req.lambda_config:
        result = calc_lambda(req.lambda_config)
        breakdown["lambda"] = result
        if result["total"] > 0:
            services_chart.append({"service": "Lambda", "cost": result["total"], "color": "#FF4F8B"})

    if req.s3_config:
        result = calc_s3(req.s3_config)
        breakdown["s3"] = result
        if result["total"] > 0:
            services_chart.append({"service": "S3", "cost": result["total"], "color": "#569A31"})

    if req.eks_config:
        result = calc_eks(req.eks_config)
        breakdown["eks"] = result
        if result["total"] > 0:
            services_chart.append({"service": "EKS", "cost": result["total"], "color": "#FF9900"})

    if req.ebs_config:
        result = calc_ebs(req.ebs_config)
        breakdown["ebs"] = result
        if result["total"] > 0:
            services_chart.append({"service": "EBS", "cost": result["total"], "color": "#8C4FFF"})

    if req.elb_config:
        result = calc_elb(req.elb_config)
        breakdown["elb"] = result
        if result["total"] > 0:
            services_chart.append({"service": "ELB", "cost": result["total"], "color": "#00A1C9"})

    if req.cloudfront_config:
        result = calc_cloudfront(req.cloudfront_config)
        breakdown["cloudfront"] = result
        if result["total"] > 0:
            services_chart.append({"service": "CloudFront", "cost": result["total"], "color": "#8C4FFF"})

    total = round(sum(s["cost"] for s in services_chart), 2)
    annual = round(total * 12, 2)
    tips = generate_tips(breakdown, total)
    potential_savings = round(sum(t["saving"] for t in tips), 2)

    return {
        "total_monthly": total,
        "total_annual": annual,
        "potential_savings": potential_savings,
        "services_chart": services_chart,
        "breakdown": breakdown,
        "optimization_tips": tips,
    }


# ── Health endpoint (required for K8s liveness/readiness probes) ─────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "aws-cost-estimator-backend"}
