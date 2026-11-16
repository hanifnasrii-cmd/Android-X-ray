import { useState } from 'react';
import { AlertTriangle, FileCode, Lock, ShieldCheck } from 'lucide-react';
import { ApkProject } from '../types/xray';

interface ManifestPanelProps {
  project: ApkProject;
  onOpenManifestLine: (line: number) => void;
}

export function ManifestPanel({ project, onOpenManifestLine }: ManifestPanelProps) {
  const manifest = project.manifest;
  const [compFilter, setCompFilter] = useState<'all' | 'activity' | 'service' | 'receiver' | 'provider'>('all');

  if (!manifest) {
    return (
      <div className="p-8 text-center text-xs text-[#7A816E]">
        No AndroidManifest.xml found in {project.fileName}.
      </div>
    );
  }

  const filteredComponents = manifest.components.filter((c) => {
    if (compFilter === 'all') return true;
    if (compFilter === 'activity') return c.type === 'activity' || c.type === 'activity-alias';
    return c.type === compFilter;
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">AndroidManifest.xml Inspector</h2>
          <div className="text-xs text-[#666C5B] dark:text-[#9CA38F] font-mono">
            {manifest.packageName} · {manifest.isBinaryXml ? 'Decoded Binary AXML' : 'Plain XML'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenManifestLine(1)}
          className="px-3 py-1.5 rounded-lg bg-[#465D18] text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <FileCode className="w-3.5 h-3.5" /> Open Decoded XML in Editor
        </button>
      </div>

      {/* Application Metadata Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {[
          ['Application Label', manifest.appLabel],
          ['Version', `${manifest.versionName} (${manifest.versionCode})`],
          ['SDK Levels', `min ${manifest.minSdk} · target ${manifest.targetSdk} · compile ${manifest.compileSdk}`],
          ['Application Class', manifest.applicationClass],
          ['Theme', manifest.appTheme],
          ['Allow Backup', manifest.allowBackup],
          ['Debuggable', manifest.debuggable],
          ['Cleartext Traffic', manifest.usesCleartextTraffic],
        ].map(([k, v]) => (
          <div key={k} className="p-3 rounded-lg border border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#181B14]">
            <div className="text-[11px] text-[#7A816E]">{k}</div>
            <div className="font-mono font-medium mt-0.5 truncate" title={v}>
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* Security Inspection Report */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {manifest.securityFindings.length > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          )}
          Manifest Security Inspection ({manifest.securityFindings.length})
        </h3>
        {manifest.securityFindings.length === 0 ? (
          <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs text-emerald-500">
            No common manifest security issues flagged (debuggable=false, no unprotected exported components).
          </div>
        ) : (
          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.06] bg-white dark:bg-[#181B14]">
            {manifest.securityFindings.map((f) => (
              <div key={f.id} className="px-4 py-3 flex items-start justify-between gap-4 text-xs">
                <div className="space-y-0.5">
                  <div className="font-semibold flex items-center gap-2">
                    <span
                      className={`font-mono uppercase text-[11px] ${
                        f.severity === 'high'
                          ? 'text-rose-500'
                          : f.severity === 'medium'
                            ? 'text-amber-500'
                            : 'text-sky-400'
                      }`}
                    >
                      [{f.severity}]
                    </span>
                    <span>{f.title}</span>
                  </div>
                  <div className="text-[#5A6050] dark:text-[#9CA38F]">{f.description}</div>
                </div>
                {f.component && <span className="font-mono text-[11px] text-[#7A816E] shrink-0">{f.component}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Components */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Application Components ({manifest.components.length})</h3>
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs">
            {(['all', 'activity', 'service', 'receiver', 'provider'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCompFilter(t)}
                className={`px-2.5 py-1 rounded-md capitalize whitespace-nowrap shrink-0 ${
                  compFilter === t
                    ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]'
                    : 'text-[#5A6050] dark:text-[#9CA38F]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.06] bg-white dark:bg-[#181B14]">
          {filteredComponents.map((c, idx) => (
            <div key={`${c.name}-${idx}`} className="px-4 py-3 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-[#9BB848] uppercase shrink-0">{c.type}</span>
                  <button
                    type="button"
                    onClick={() => onOpenManifestLine(c.lineNumber)}
                    className="font-mono font-semibold hover:underline truncate text-left"
                  >
                    {c.name}
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                  <span className={c.exported ? 'text-amber-500' : 'text-emerald-500'}>
                    exported: {c.exported === null ? 'unspecified' : String(c.exported)}
                  </span>
                  {c.permission && (
                    <span className="text-[#7A816E] flex items-center gap-1">
                      <Lock className="w-3 h-3" /> {c.permission}
                    </span>
                  )}
                </div>
              </div>
              {c.intentFilters.length > 0 && (
                <div className="pl-3 space-y-1 text-[11px] font-mono text-[#666C5B] dark:text-[#9CA38F]">
                  {c.intentFilters.map((f, fIdx) => (
                    <div key={fIdx}>
                      intent-filter: {f.actions.join(', ') || 'none'}
                      {f.dataSchemes.length > 0 ? ` | uri=${f.dataSchemes.join(',')}://${f.dataHosts.join(',')}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Permissions & Deep Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Declared Permissions ({manifest.permissions.length})</h3>
          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.06] bg-white dark:bg-[#181B14] max-h-64 overflow-y-auto">
            {manifest.permissions.length === 0 ? (
              <div className="p-4 text-xs text-[#7A816E]">No permissions declared.</div>
            ) : (
              manifest.permissions.map((p, i) => (
                <div key={i} className="px-3 py-2 text-xs font-mono flex items-center justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  {p.maxSdkVersion && <span className="text-[#7A816E] shrink-0">maxSdk={p.maxSdkVersion}</span>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Deep Links &amp; Hardware Features</h3>
          <div className="border border-black/10 dark:border-white/[0.08] rounded-xl divide-y divide-black/5 dark:divide-white/[0.06] bg-white dark:bg-[#181B14] max-h-64 overflow-y-auto text-xs">
            {manifest.deepLinks.map((d, i) => (
              <div key={`dl-${i}`} className="px-3 py-2 font-mono">
                <div>
                  {d.scheme}://{d.host}
                  {d.path}
                </div>
                <div className="text-[11px] text-[#7A816E]">{d.component}</div>
              </div>
            ))}
            {manifest.usesFeatures.map((uf, i) => (
              <div key={`uf-${i}`} className="px-3 py-2 font-mono flex justify-between">
                <span>{uf.name}</span>
                <span className="text-[#7A816E]">required={uf.required}</span>
              </div>
            ))}
            {manifest.deepLinks.length === 0 && manifest.usesFeatures.length === 0 && (
              <div className="p-4 text-[#7A816E]">No deep links or uses-feature declarations found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
