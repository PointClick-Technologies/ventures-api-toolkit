interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

export default function JsonViewer({ data, maxHeight = '400px' }: JsonViewerProps) {
  const json = JSON.stringify(data, null, 2);
  return (
    <pre
      className="font-mono text-xs text-neutral-300 bg-neutral-950 rounded-lg p-4 overflow-auto leading-relaxed"
      style={{ maxHeight }}
    >
      {json}
    </pre>
  );
}
