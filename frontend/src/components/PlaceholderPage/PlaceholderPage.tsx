export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 8 }}>
        {title}
      </h1>
      <p style={{ color: '#888', fontSize: 14 }}>
        Раздел в разработке
      </p>
    </div>
  );
}
