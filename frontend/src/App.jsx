import { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";

const API = "http://localhost:8000";

const SERVICE_COLORS = {
  EC2: "#FF9900", RDS: "#3F8624", Lambda: "#FF4F8B",
  S3: "#569A31", EKS: "#F7931E", EBS: "#8C4FFF",
  ELB: "#00A1C9", CloudFront: "#C7131F",
};

const SEVERITY_STYLE = {
  high:   { bg: "#FF000015", border: "#FF4444", badge: "#FF4444", label: "HIGH IMPACT" },
  medium: { bg: "#FF990015", border: "#FF9900", badge: "#FF9900", label: "MEDIUM"      },
  low:    { bg: "#00A1C915", border: "#00A1C9", badge: "#00A1C9", label: "LOW"         },
};

// ── tiny helpers ─────────────────────────────────────────────────────────────
const fmt   = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Input = ({ label, ...props }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94A3B8" }}>
    {label}
    <input {...props} style={{
      background: "#0F172A", border: "1px solid #1E3A5F", borderRadius: 6,
      color: "#E2E8F0", padding: "6px 10px", fontSize: 13, outline: "none",
      ...props.style,
    }} />
  </label>
);
const Select = ({ label, children, ...props }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94A3B8" }}>
    {label}
    <select {...props} style={{
      background: "#0F172A", border: "1px solid #1E3A5F", borderRadius: 6,
      color: "#E2E8F0", padding: "6px 10px", fontSize: 13, outline: "none",
    }}>
      {children}
    </select>
  </label>
);

// ── EC2 Panel ─────────────────────────────────────────────────────────────────
const EC2_TYPES = [
  "t3.micro","t3.small","t3.medium","t3.large","t3.xlarge","t3.2xlarge",
  "t4g.micro","t4g.small","t4g.medium","t4g.large",
  "m5.large","m5.xlarge","m5.2xlarge","c5.large","c5.xlarge","r5.large","r5.xlarge",
];
function EC2Panel({ value, onChange }) {
  const add = () => onChange([...value, { instance_type: "t3.medium", count: 1, os: "linux", tenancy: "shared", usage_hours: 730 }]);
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i, k, v) => onChange(value.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  return (
    <div>
      {value.map((inst, i) => (
        <div key={i} style={{ background: "#0D1F35", border: "1px solid #1E3A5F", borderRadius: 8, padding: 14, marginBottom: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <Select label="Instance Type" value={inst.instance_type} onChange={e => update(i, "instance_type", e.target.value)}>
            {EC2_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
          <Input label="Count" type="number" min={1} value={inst.count} onChange={e => update(i, "count", +e.target.value)} />
          <Select label="OS" value={inst.os} onChange={e => update(i, "os", e.target.value)}>
            <option value="linux">Linux</option>
            <option value="windows">Windows</option>
          </Select>
          <Input label="Hours/Month" type="number" min={1} max={730} value={inst.usage_hours} onChange={e => update(i, "usage_hours", +e.target.value)} />
          <button onClick={() => remove(i)} style={{ background: "#FF444422", border: "1px solid #FF4444", color: "#FF4444", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ background: "transparent", border: "1px dashed #1E3A5F", color: "#FF9900", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, width: "100%" }}>+ Add EC2 Instance</button>
    </div>
  );
}

// ── RDS Panel ─────────────────────────────────────────────────────────────────
const RDS_TYPES = ["db.t3.micro","db.t3.small","db.t3.medium","db.t3.large","db.m5.large","db.m5.xlarge","db.r5.large","db.r5.xlarge"];
const RDS_ENGINES = ["mysql","postgres","aurora-mysql","aurora-postgres","oracle","sqlserver"];
function RDSPanel({ value, onChange }) {
  const add = () => onChange([...value, { instance_type: "db.t3.medium", engine: "mysql", count: 1, multi_az: false, storage_gb: 100, storage_type: "gp2" }]);
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i, k, v) => onChange(value.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  return (
    <div>
      {value.map((inst, i) => (
        <div key={i} style={{ background: "#0D1F35", border: "1px solid #1E3A5F", borderRadius: 8, padding: 14, marginBottom: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <Select label="Instance Type" value={inst.instance_type} onChange={e => update(i, "instance_type", e.target.value)}>
            {RDS_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
          <Select label="Engine" value={inst.engine} onChange={e => update(i, "engine", e.target.value)}>
            {RDS_ENGINES.map(e => <option key={e}>{e}</option>)}
          </Select>
          <Input label="Count" type="number" min={1} value={inst.count} onChange={e => update(i, "count", +e.target.value)} />
          <Input label="Storage (GB)" type="number" min={20} value={inst.storage_gb} onChange={e => update(i, "storage_gb", +e.target.value)} />
          <Select label="Multi-AZ" value={inst.multi_az ? "yes" : "no"} onChange={e => update(i, "multi_az", e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
          <button onClick={() => remove(i)} style={{ background: "#FF444422", border: "1px solid #FF4444", color: "#FF4444", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ background: "transparent", border: "1px dashed #1E3A5F", color: "#3F8624", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, width: "100%" }}>+ Add RDS Instance</button>
    </div>
  );
}

// ── Lambda Panel ──────────────────────────────────────────────────────────────
function LambdaPanel({ value, onChange }) {
  const enabled = !!value;
  const cfg = value || { requests_per_month: 1000000, avg_duration_ms: 200, memory_mb: 128 };
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#94A3B8", marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? cfg : null)} style={{ accentColor: "#FF4F8B" }} />
        Enable Lambda
      </label>
      {enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Input label="Requests/Month" type="number" value={cfg.requests_per_month} onChange={e => onChange({ ...cfg, requests_per_month: +e.target.value })} />
          <Input label="Avg Duration (ms)" type="number" value={cfg.avg_duration_ms} onChange={e => onChange({ ...cfg, avg_duration_ms: +e.target.value })} />
          <Input label="Memory (MB)" type="number" value={cfg.memory_mb} onChange={e => onChange({ ...cfg, memory_mb: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── S3 Panel ──────────────────────────────────────────────────────────────────
function S3Panel({ value, onChange }) {
  const enabled = !!value;
  const cfg = value || { storage_gb: 100, put_requests: 100000, get_requests: 1000000, transfer_out_gb: 10 };
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#94A3B8", marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? cfg : null)} style={{ accentColor: "#569A31" }} />
        Enable S3
      </label>
      {enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <Input label="Storage (GB)" type="number" value={cfg.storage_gb} onChange={e => onChange({ ...cfg, storage_gb: +e.target.value })} />
          <Input label="PUT Requests" type="number" value={cfg.put_requests} onChange={e => onChange({ ...cfg, put_requests: +e.target.value })} />
          <Input label="GET Requests" type="number" value={cfg.get_requests} onChange={e => onChange({ ...cfg, get_requests: +e.target.value })} />
          <Input label="Transfer Out (GB)" type="number" value={cfg.transfer_out_gb} onChange={e => onChange({ ...cfg, transfer_out_gb: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── EKS Panel ─────────────────────────────────────────────────────────────────
function EKSPanel({ value, onChange }) {
  const enabled = !!value;
  const cfg = value || { cluster_count: 1, node_instance_type: "t3.medium", node_count: 3 };
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#94A3B8", marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? cfg : null)} style={{ accentColor: "#F7931E" }} />
        Enable EKS
      </label>
      {enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Input label="Clusters" type="number" min={1} value={cfg.cluster_count} onChange={e => onChange({ ...cfg, cluster_count: +e.target.value })} />
          <Select label="Node Type" value={cfg.node_instance_type} onChange={e => onChange({ ...cfg, node_instance_type: e.target.value })}>
            {EC2_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
          <Input label="Nodes per Cluster" type="number" min={1} value={cfg.node_count} onChange={e => onChange({ ...cfg, node_count: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── EBS Panel ─────────────────────────────────────────────────────────────────
function EBSPanel({ value, onChange }) {
  const enabled = !!value;
  const cfg = value || { volume_type: "gp3", size_gb: 100, count: 1 };
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#94A3B8", marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? cfg : null)} style={{ accentColor: "#8C4FFF" }} />
        Enable EBS Volumes
      </label>
      {enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Select label="Volume Type" value={cfg.volume_type} onChange={e => onChange({ ...cfg, volume_type: e.target.value })}>
            <option value="gp3">gp3</option>
            <option value="gp2">gp2</option>
            <option value="io1">io1</option>
          </Select>
          <Input label="Size (GB)" type="number" min={1} value={cfg.size_gb} onChange={e => onChange({ ...cfg, size_gb: +e.target.value })} />
          <Input label="Count" type="number" min={1} value={cfg.count} onChange={e => onChange({ ...cfg, count: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── ELB Panel ─────────────────────────────────────────────────────────────────
function ELBPanel({ value, onChange }) {
  const enabled = !!value;
  const cfg = value || { count: 1, lcu_per_hour: 1.0 };
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#94A3B8", marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? cfg : null)} style={{ accentColor: "#00A1C9" }} />
        Enable Load Balancer (ELB)
      </label>
      {enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Load Balancer Count" type="number" min={1} value={cfg.count} onChange={e => onChange({ ...cfg, count: +e.target.value })} />
          <Input label="Avg LCU/hour" type="number" step={0.1} value={cfg.lcu_per_hour} onChange={e => onChange({ ...cfg, lcu_per_hour: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── CloudFront Panel ──────────────────────────────────────────────────────────
function CloudFrontPanel({ value, onChange }) {
  const enabled = !!value;
  const cfg = value || { transfer_out_gb: 100, requests_per_month: 10000000 };
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#94A3B8", marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked ? cfg : null)} style={{ accentColor: "#C7131F" }} />
        Enable CloudFront CDN
      </label>
      {enabled && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Transfer Out (GB/mo)" type="number" value={cfg.transfer_out_gb} onChange={e => onChange({ ...cfg, transfer_out_gb: +e.target.value })} />
          <Input label="Requests/Month" type="number" value={cfg.requests_per_month} onChange={e => onChange({ ...cfg, requests_per_month: +e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, color, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: "#071526", border: `1px solid #1E3A5F`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, color: "#E2E8F0" }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 15, color }}>{title}</span>
        <span style={{ marginLeft: "auto", color: "#475569", fontSize: 18 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [ec2, setEc2] = useState([{ instance_type: "t3.medium", count: 2, os: "linux", tenancy: "shared", usage_hours: 730 }]);
  const [rds, setRds] = useState([]);
  const [lambda, setLambda] = useState(null);
  const [s3, setS3] = useState(null);
  const [eks, setEks] = useState(null);
  const [ebs, setEbs] = useState(null);
  const [elb, setElb] = useState(null);
  const [cf, setCf] = useState(null);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("chart");

  const estimate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ec2_instances: ec2,
          rds_instances: rds,
          lambda_config: lambda,
          s3_config: s3,
          eks_config: eks,
          ebs_config: ebs,
          elb_config: elb,
          cloudfront_config: cf,
        }),
      });
      const data = await res.json();
      setResult(data);
      setActiveTab("chart");
    } catch (e) {
      setError("Cannot reach backend. Make sure FastAPI is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#020D1A", fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#E2E8F0" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(90deg, #071526 0%, #0D2137 100%)", borderBottom: "1px solid #1E3A5F", padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: "#FF9900", borderRadius: 8, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>☁️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: -0.5 }}>AWS Cost Estimator</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Infrastructure cost planning & optimization</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#475569", background: "#0D1F35", border: "1px solid #1E3A5F", borderRadius: 6, padding: "4px 10px" }}>
          Prices in USD · us-east-1
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 0, height: "calc(100vh - 73px)" }}>
        {/* Left: Config */}
        <div style={{ padding: 24, overflowY: "auto", borderRight: "1px solid #1E3A5F" }}>
          <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1, marginBottom: 16, textTransform: "uppercase" }}>Configure Resources</div>

          <Section title="EC2 Compute" icon="🖥️" color="#FF9900">
            <EC2Panel value={ec2} onChange={setEc2} />
          </Section>
          <Section title="RDS Database" icon="🗄️" color="#3F8624">
            <RDSPanel value={rds} onChange={setRds} />
          </Section>
          <Section title="Lambda (Serverless)" icon="⚡" color="#FF4F8B">
            <LambdaPanel value={lambda} onChange={setLambda} />
          </Section>
          <Section title="S3 Storage" icon="🪣" color="#569A31">
            <S3Panel value={s3} onChange={setS3} />
          </Section>
          <Section title="EKS (Kubernetes)" icon="⚙️" color="#F7931E">
            <EKSPanel value={eks} onChange={setEks} />
          </Section>
          <Section title="EBS Volumes" icon="💾" color="#8C4FFF">
            <EBSPanel value={ebs} onChange={setEbs} />
          </Section>
          <Section title="Load Balancer (ELB)" icon="⚖️" color="#00A1C9">
            <ELBPanel value={elb} onChange={setElb} />
          </Section>
          <Section title="CloudFront CDN" icon="🌐" color="#C7131F">
            <CloudFrontPanel value={cf} onChange={setCf} />
          </Section>

          <button onClick={estimate} disabled={loading} style={{
            width: "100%", background: loading ? "#1E3A5F" : "linear-gradient(135deg, #FF9900, #FF6600)",
            border: "none", color: "#fff", fontWeight: 700, fontSize: 16,
            borderRadius: 10, padding: "14px 0", cursor: loading ? "not-allowed" : "pointer",
            marginTop: 8, letterSpacing: 0.5,
            boxShadow: loading ? "none" : "0 4px 20px #FF990040",
          }}>
            {loading ? "Calculating…" : "Calculate Cost Estimate →"}
          </button>
          {error && <div style={{ marginTop: 12, background: "#FF000015", border: "1px solid #FF4444", borderRadius: 8, padding: 12, fontSize: 13, color: "#FF8888" }}>{error}</div>}
        </div>

        {/* Right: Results */}
        <div style={{ padding: 24, overflowY: "auto", background: "#040F1C" }}>
          {!result ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#475569" }}>
              <div style={{ fontSize: 48 }}>📊</div>
              <div style={{ fontSize: 14 }}>Configure your resources and click</div>
              <div style={{ fontSize: 14, color: "#FF9900", fontWeight: 600 }}>Calculate Cost Estimate</div>
            </div>
          ) : (
            <div>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  { label: "Monthly Cost", value: fmt(result.total_monthly), color: "#FF9900", icon: "📅" },
                  { label: "Annual Cost",  value: fmt(result.total_annual),  color: "#E2E8F0", icon: "📆" },
                  { label: "Potential Savings", value: fmt(result.potential_savings), color: "#3F8624", icon: "💡" },
                  { label: "Services",     value: result.services_chart.length, color: "#00A1C9", icon: "☁️" },
                ].map(c => (
                  <div key={c.label} style={{ background: "#071526", border: "1px solid #1E3A5F", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{c.icon} {c.label.toUpperCase()}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#071526", borderRadius: 8, padding: 4, border: "1px solid #1E3A5F" }}>
                {["chart", "breakdown", "tips"].map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: activeTab === t ? "#1E3A5F" : "transparent",
                    color: activeTab === t ? "#FF9900" : "#64748B",
                  }}>
                    {t === "chart" ? "📊 Charts" : t === "breakdown" ? "📋 Breakdown" : `💡 Tips (${result.optimization_tips.length})`}
                  </button>
                ))}
              </div>

              {/* Chart tab */}
              {activeTab === "chart" && (
                <div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>Cost by Service</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={result.services_chart} dataKey="cost" nameKey="service" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {result.services_chart.map((entry) => (
                          <Cell key={entry.service} fill={SERVICE_COLORS[entry.service] || "#8C4FFF"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#0D1F35", border: "1px solid #1E3A5F", borderRadius: 8, color: "#E2E8F0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 16, marginBottom: 8 }}>Monthly Cost per Service</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={result.services_chart} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" />
                      <XAxis dataKey="service" tick={{ fill: "#64748B", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748B", fontSize: 11 }} tickFormatter={v => `$${v}`} />
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#0D1F35", border: "1px solid #1E3A5F", borderRadius: 8, color: "#E2E8F0" }} />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                        {result.services_chart.map((entry) => (
                          <Cell key={entry.service} fill={SERVICE_COLORS[entry.service] || "#8C4FFF"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Breakdown tab */}
              {activeTab === "breakdown" && (
                <div>
                  {result.services_chart.map(s => {
                    const key = s.service.toLowerCase().replace("cloudfront","cloudfront");
                    const bd = result.breakdown[key === "cloudfront" ? "cloudfront" : key];
                    return (
                      <div key={s.service} style={{ background: "#071526", border: `1px solid ${SERVICE_COLORS[s.service]}33`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, color: SERVICE_COLORS[s.service], fontSize: 14 }}>{s.service}</span>
                          <span style={{ fontWeight: 700, color: "#E2E8F0", fontSize: 15 }}>{fmt(s.cost)}<span style={{ fontSize: 11, color: "#64748B" }}>/mo</span></span>
                        </div>
                        {bd && (
                          <div style={{ fontSize: 12, color: "#94A3B8" }}>
                            {bd.breakdown?.map((item, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1E3A5F", paddingTop: 6, marginTop: 6 }}>
                                <span>{item.count}× {item.type || item.instance_type}</span>
                                <span style={{ color: "#E2E8F0" }}>{fmt(item.total_cost)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tips tab */}
              {activeTab === "tips" && (
                <div>
                  {result.optimization_tips.map((tip, i) => {
                    const s = SEVERITY_STYLE[tip.severity];
                    return (
                      <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                          <span style={{ background: s.badge, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 6px" }}>{s.label}</span>
                          <span style={{ fontSize: 12, color: "#94A3B8" }}>{tip.service}</span>
                          {tip.saving > 0 && <span style={{ marginLeft: "auto", color: "#3F8624", fontSize: 13, fontWeight: 700 }}>Save {fmt(tip.saving)}/mo</span>}
                        </div>
                        <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.5 }}>{tip.tip}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
