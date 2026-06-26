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


def test_estimate_empty_returns_zero():
    response = client.post("/estimate", json={})
    assert response.status_code == 200
    data = response.json()
    assert data["total_monthly"] == 0


def test_estimate_annual_field_present():
    response = client.post("/estimate", json={})
    assert response.status_code == 200
    assert "total_annual" in response.json()


def test_cors_headers():
    response = client.options(
        "/estimate",
        headers={"Origin": "http://localhost:3000"}
    )
    assert response.headers.get("access-control-allow-origin") is not None
