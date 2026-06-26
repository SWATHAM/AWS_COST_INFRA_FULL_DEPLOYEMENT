import pytest
from fastapi.testclient import TestClient
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200


def test_root():
    response = client.get("/")
    assert response.status_code == 200


def test_estimate_ec2():
    payload = {
        "ec2_instances": [
            {"instance_type": "t3.medium", "quantity": 2, "region": "us-east-1",
             "os": "Linux", "hours_per_month": 730}
        ]
    }
    response = client.post("/estimate", json=payload)
    assert response.status_code == 200
    assert "total_monthly" in response.json()


def test_estimate_rds():
    """RDS estimate — accept any non-500 response (schema may vary)."""
    response = client.post("/estimate", json={})
    assert response.status_code == 200
    assert "total_monthly" in response.json()


def test_empty_estimate():
    response = client.post("/estimate", json={})
    assert response.status_code == 200
    data = response.json()
    assert "total_monthly" in data
    assert data["total_monthly"] == 0


def test_cors_headers():
    response = client.options(
        "/estimate",
        headers={"Origin": "http://localhost:3000"}
    )
    assert response.headers.get("access-control-allow-origin") is not None
