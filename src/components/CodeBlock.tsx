interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export default function CodeBlock({ code, language, className = '' }: CodeBlockProps) {
  return (
    <div className={`rounded-xl overflow-hidden ${className}`}>
      {language && (
        <div className="bg-gray-700 px-4 py-1.5 text-xs font-medium text-gray-300 uppercase tracking-wide">
          {language}
        </div>
      )}
      <pre className="bg-gray-900 px-4 py-4 overflow-x-auto">
        <code className="text-sm font-mono text-gray-100 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
