import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export default function CodeBlock({ code, language, className = '' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-xl overflow-hidden border border-white/10 shadow-lg ${className}`}>
      {/* Title bar — editor-style with traffic lights */}
      <div className="flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          {language && (
            <span className="ml-3 text-xs font-medium text-white/40 tracking-wide">{language}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {/* Code area with line numbers */}
      <div className="bg-[#11111b] overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="leading-relaxed hover:bg-white/[0.03]">
                <td className="select-none text-right pr-4 pl-4 py-0 text-xs font-mono text-white/15 w-10 align-top">
                  {i + 1}
                </td>
                <td className="pr-4 py-0">
                  <code className="text-sm font-mono text-[#cdd6f4] whitespace-pre">{line || ' '}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Top/bottom padding via spacer rows */}
        <div className="h-3" />
      </div>
    </div>
  );
}
