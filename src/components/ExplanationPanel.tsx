import { useMemo, useState } from 'react';
import { BookOpen, Sparkles, Terminal } from 'lucide-react';
import { ApkEntry, ApkProject } from '../types/xray';
import { buildFileExplanation } from '../engines/explanationEngine';

interface ExplanationPanelProps {
  entry: ApkEntry;
  project: ApkProject | null;
  snippetPreview: string;
  onJumpToFile: (path: string) => void;
}

export function ExplanationPanel({ entry, project, snippetPreview, onJumpToFile }: ExplanationPanelProps) {
  const [audience, setAudience] = useState<'beginner' | 'technical'>('beginner');
  const [aiConsentChecked, setAiConsentChecked] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const explanation = useMemo(() => buildFileExplanation(entry, project), [entry, project]);

  const handleRequestAiExplain = async () => {
    if (!aiConsentChecked) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const resp = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userConsented: true,
          filePath: entry.path,
          formatName: entry.format.formatName,
          snippet: snippetPreview.slice(0, 5000),
        }),
      });
      const data = (await resp.json()) as { explanation?: string; error?: string };
      if (!resp.ok) {
        setAiError(data.error || 'Server returned an error.');
      } else {
        setAiResult(data.explanation || '');
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="p-5 max-w-3xl space-y-5 overflow-y-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#181A14] dark:text-[#E4E6DD]">{explanation.title}</h3>
          <div className="text-xs text-[#666C5B] dark:text-[#9CA38F] mt-0.5">{explanation.format}</div>
        </div>

        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setAudience('beginner')}
            className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              audience === 'beginner' ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]' : 'text-[#666C5B] dark:text-[#9CA38F]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" /> Beginner
          </button>
          <button
            type="button"
            onClick={() => setAudience('technical')}
            className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              audience === 'technical' ? 'bg-[#465D18] text-white dark:bg-[#3E4A24] dark:text-[#DDF0A4]' : 'text-[#666C5B] dark:text-[#9CA38F]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> Technical
          </button>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#1B1E17] text-sm leading-relaxed">
        {audience === 'beginner' ? explanation.beginnerSummary : explanation.technicalSummary}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-lg border border-black/10 dark:border-white/[0.08] space-y-2">
          <div className="font-semibold text-[#181A14] dark:text-[#E4E6DD]">What It Contains</div>
          <ul className="list-disc pl-4 space-y-1 text-[#5A6050] dark:text-[#B4BAA7]">
            {explanation.whatItContains.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="p-4 rounded-lg border border-black/10 dark:border-white/[0.08] space-y-2">
          <div className="font-semibold text-[#181A14] dark:text-[#E4E6DD]">How Android Uses It</div>
          <p className="text-[#5A6050] dark:text-[#B4BAA7] leading-relaxed">{explanation.howAndroidUsesIt}</p>
        </div>
        <div className="p-4 rounded-lg border border-black/10 dark:border-white/[0.08] space-y-1.5">
          <div className="font-semibold text-emerald-600 dark:text-emerald-400">What Can Be Decoded</div>
          <p className="text-[#5A6050] dark:text-[#B4BAA7]">{explanation.whatCanBeDecoded}</p>
        </div>
        <div className="p-4 rounded-lg border border-black/10 dark:border-white/[0.08] space-y-1.5">
          <div className="font-semibold text-amber-600 dark:text-amber-400">What Cannot Be Recovered</div>
          <p className="text-[#5A6050] dark:text-[#B4BAA7]">{explanation.whatCannotBeRecovered}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-xs pt-2 border-t border-black/10 dark:border-white/[0.08]">
        <div>
          <div className="font-semibold mb-1.5">Referenced By</div>
          <div className="flex flex-wrap gap-2">
            {explanation.referencedBy.map((ref) => (
              <span key={ref} className="font-mono text-[#5A6050] dark:text-[#9CA38F]">
                {ref}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="font-semibold mb-1.5">Useful Related Files</div>
          <div className="flex flex-wrap gap-2">
            {explanation.nextFilesToInspect.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onJumpToFile(p)}
                className="font-mono text-[#465D18] dark:text-[#A9CC52] hover:underline"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Optional Consented AI Deep Analysis */}
      <div className="p-4 rounded-lg border border-black/10 dark:border-white/[0.08] bg-[#ECEFE6]/60 dark:bg-[#191C15] space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-[#9BB848]" />
          Optional Cloud AI Explanation (Off by Default)
        </div>
        <label className="flex items-start gap-2 text-xs text-[#5A6050] dark:text-[#9CA38F] cursor-pointer">
          <input
            type="checkbox"
            checked={aiConsentChecked}
            onChange={(e) => setAiConsentChecked(e.target.checked)}
            className="mt-0.5 accent-[#465D18]"
          />
          <span>
            I explicitly consent to sending an excerpt of <strong>{entry.name}</strong> (up to 5 KB) to the server AI endpoint for analysis. Core inspection works 100% offline without checking this.
          </span>
        </label>
        <button
          type="button"
          disabled={!aiConsentChecked || aiLoading}
          onClick={handleRequestAiExplain}
          className="px-3 py-1.5 rounded-md bg-[#465D18] text-white text-xs font-medium disabled:opacity-40"
        >
          {aiLoading ? 'Analyzing Excerpt…' : 'Analyze Excerpt with AI'}
        </button>
        {aiError && <div className="text-xs text-rose-400">{aiError}</div>}
        {aiResult && (
          <div className="text-xs whitespace-pre-wrap leading-relaxed p-3 rounded bg-white dark:bg-[#141611] border border-black/10 dark:border-white/10">
            {aiResult}
          </div>
        )}
      </div>
    </div>
  );
}
