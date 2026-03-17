import { useState, useEffect } from "react";
import { Download, RotateCw, AlertCircle } from "lucide-react";

interface AuditLog {
  id: number;
  action: string;
  details: { [key: string]: any } | null;
  ip: string | null;
  user_agent?: string | null;
  timestamp: string;
  created_at?: string;
}

interface ActivityLog {
  id: number;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: { [key: string]: any } | null;
}

export default function AuditLogs() {
  const [activeTab, setActiveTab] = useState<"audit" | "activity">("audit");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState<"csv" | null>(null);

  useEffect(() => {
    if (activeTab === "audit") {
      fetchAuditLogs();
    } else {
      fetchActivityLogs();
    }
  }, [limit, offset, activeTab]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/audit-logs?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      setAuditLogs(data.logs);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/activity-logs?limit=${limit}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      const data = await res.json();
      setActivityLogs(data.logs);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    setExporting("csv");
    try {
      const logs = activeTab === "audit" ? auditLogs : activityLogs;
      let csvContent = "";

      if (activeTab === "audit") {
        const headers = ["ID", "Action", "IP", "User Agent", "Timestamp", "Details"];
        csvContent = [
          headers.join(","),
          ...(logs as AuditLog[]).map((log) =>
            [
              log.id,
              `"${(log as AuditLog).action}"`,
              log.ip || "",
              `"${((log as AuditLog).user_agent || "").replace(/"/g, '""')}"`,
              new Date((log as AuditLog).timestamp).toLocaleString(),
              `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
            ].join(",")
          )
        ].join("\n");
      } else {
        const headers = ["ID", "Actor Email", "Actor Role", "Action", "Target Type", "Target ID", "Timestamp", "Details"];
        csvContent = [
          headers.join(","),
          ...(logs as ActivityLog[]).map((log) =>
            [
              log.id,
              (log as ActivityLog).actor_email || "",
              (log as ActivityLog).actor_role || "",
              `"${(log as ActivityLog).action}"`,
              (log as ActivityLog).target_type || "",
              (log as ActivityLog).target_id || "",
              new Date(log.created_at).toLocaleString(),
              `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
            ].join(",")
          )
        ].join("\n");
      }

      const fileName = activeTab === "audit" 
        ? `audit-logs-${new Date().toISOString().split("T")[0]}.csv`
        : `activity-logs-${new Date().toISOString().split("T")[0]}.csv`;
      
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed:", err);
      alert("Failed to export CSV");
    } finally {
      setExporting(null);
    }
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const currentLogs = activeTab === "audit" ? auditLogs : activityLogs;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Logs</h2>
        <p className="text-gray-600 mt-1">System activity and security events</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-8">
          <button
            onClick={() => { setActiveTab("audit"); setOffset(0); }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === "audit"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Audit Logs
          </button>
          <button
            onClick={() => { setActiveTab("activity"); setOffset(0); }}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === "activity"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Activity Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-red-700">{error}</div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-gray-600">
            Showing {currentLogs.length === 0 ? 0 : offset + 1}-{Math.min(offset + limit, total)} of {total} records
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              disabled={currentLogs.length === 0 || exporting !== null}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </button>
            <button
              onClick={activeTab === "audit" ? fetchAuditLogs : fetchActivityLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
            >
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg">
          <table className="w-full text-xs min-w-max">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 sticky top-0">
                {activeTab === "audit" ? (
                  <>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Action</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">IP Address</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">User Agent</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Timestamp</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Details</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Actor Email</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Actor Role</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Action</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Target Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Target ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Timestamp</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Details</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={activeTab === "audit" ? 6 : 8} className="px-3 py-4 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "audit" ? 6 : 8} className="px-3 py-4 text-center text-gray-500">
                    No {activeTab === "audit" ? "audit" : "activity"} logs found
                  </td>
                </tr>
              ) : (
                currentLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-200 hover:bg-gray-50">
                    {activeTab === "audit" ? (
                      <>
                        <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{log.id}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium whitespace-nowrap">
                            {(log as AuditLog).action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs whitespace-nowrap">
                          {log.ip || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                          {(log as AuditLog).user_agent || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                          {new Date((log as AuditLog).timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs max-w-xs overflow-x-auto">
                          <code className="bg-gray-100 px-2 py-1 rounded inline-block">
                            {JSON.stringify(log.details || {})}
                          </code>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{log.id}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                          {(log as ActivityLog).actor_email || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                          {(log as ActivityLog).actor_role || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium whitespace-nowrap">
                            {(log as ActivityLog).action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                          {(log as ActivityLog).target_type || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs whitespace-nowrap">
                          {(log as ActivityLog).target_id || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs max-w-xs overflow-x-auto">
                          <code className="bg-gray-100 px-2 py-1 rounded inline-block">
                            {JSON.stringify(log.details || {})}
                          </code>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-6 flex justify-center gap-2 items-center">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Previous
          </button>
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages || 1}
          </div>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total || loading}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
