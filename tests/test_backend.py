"""
Basic smoke tests for the AWS Cost Estimator FastAPI backend.
Run with: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app

client = TestClient(app)


def test_health_check():
    """Health endpoint must return 200."""
    response = client.get("/health")
    assert response.status_code == 200


def test_root():
    """Root endpoint should return 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_estimate_ec2():
    """EC2 cost estimate returns a numeric monthly cost."""
    payload = {
        "services": [
            {
                "type": "ec2",
                "instance_type": "t3.medium",
                "quantity": 2
            }
        ]
    }
    response = client.post("/estimate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "total_monthly_cost" in data
    assert isinstance(data["total_monthly_cost"], (int, float))
    assert data["total_monthly_cost"] > 0


def test_estimate_rds():
    """RDS cost estimate returns a numeric monthly cost."""
    payload = {
        "services": [
            {
                "type": "rds",
                "instance_class": "db.t3.micro",
                "engine": "postgres",
                "multi_az": False
            }
        ]
    }
    response = client.post("/estimate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "total_monthly_cost" in data


def test_invalid_service_type():
    """Unknown service type should return 422."""
    payload = {
        "services": [
            {"type": "invalid_service"}
        ]
    }
    response = client.post("/estimate", json=payload)
    assert response.status_code in (422, 400)


def test_cors_headers():
    """CORS headers must be present for cross-origin requests."""
    response = client.options(
        "/estimate",
        headers={"Origin": "http://localhost:3000"}
    )
    assert response.headers.get("access-control-allow-origin") is not None
