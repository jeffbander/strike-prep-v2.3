"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import Link from "next/link";

export default function AuditLogsPage() {
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const auditLogs = useQuery(api.auditLogs.list, {
    limit: 100,
    resourceType: resourceTypeFilter || undefined,
    action: actionFilter || undefined,
  });
  const resourceTypes = useQuery(api.auditLogs.getResourceTypes);
  const actions = useQuery(api.auditLogs.getActions);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case "CREATE":
        return "bg-emerald-600";
      case "UPDATE":
        return "bg-blue-600";
      case "DELETE":
        return "bg-red-600";
      case "ASSIGN":
        return "bg-purple-600";
      case "CONFIRM":
        return "bg-green-600";
      case "CANCEL":
        return "bg-orange-600";
      default:
        return "bg-slate-600";
    }
  };

  const renderChanges = (changes: any) => {
    if (!changes) return null;

    if (typeof changes === "string") {
      return <span className="text-slate-400">{changes}</span>;
    }

    return (
      <div className="text-sm text-slate-400">
        {Object.entries(changes).map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="text-slate-500">{key}:</span>
            <span>{String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Audit Logs</h1>
            <p className="text-slate-400 mt-1">Track all changes made in the system</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <select
            value={resourceTypeFilter}
            onChange={(e) => setResourceTypeFilter(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Resource Types</option>
            {resourceTypes?.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Actions</option>
            {actions?.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
          {(resourceTypeFilter || actionFilter) && (
            <button
              onClick={() => {
                setResourceTypeFilter("");
                setActionFilter("");
              }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
          <span className="text-slate-400 self-center ml-auto">
            {auditLogs?.length || 0} entries
          </span>
        </div>

        {/* Logs Table */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  User
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Resource
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {auditLogs === undefined ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      {log.user ? (
                        <div>
                          <div className="font-medium">
                            {log.user.firstName} {log.user.lastName}
                          </div>
                          <div className="text-xs text-slate-400">{log.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500">Unknown User</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.resourceType}</div>
                      {log.resourceId && (
                        <div className="text-xs text-slate-400 font-mono">
                          {log.resourceId.toString().slice(0, 12)}...
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{renderChanges(log.changes)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-slate-800 rounded-lg">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Action Legend</h3>
          <div className="flex flex-wrap gap-3">
            <span className="px-2 py-1 bg-emerald-600 rounded text-xs">CREATE</span>
            <span className="px-2 py-1 bg-blue-600 rounded text-xs">UPDATE</span>
            <span className="px-2 py-1 bg-red-600 rounded text-xs">DELETE</span>
            <span className="px-2 py-1 bg-purple-600 rounded text-xs">ASSIGN</span>
            <span className="px-2 py-1 bg-green-600 rounded text-xs">CONFIRM</span>
            <span className="px-2 py-1 bg-orange-600 rounded text-xs">CANCEL</span>
          </div>
        </div>
      </div>
    </div>
  );
}
