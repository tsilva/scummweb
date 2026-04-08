export default function SeoJsonLd({ data }) {
  const items = Array.isArray(data) ? data : [data];

  return items.map((item, index) => (
    <script
      key={index}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
      type="application/ld+json"
    />
  ));
}
