export function JsonLdPerson() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "김윤수",
    alternateName: "Yoonsoo Kim",
    jobTitle: "프론트엔드 개발자",
    email: "mailto:bbabi0901@gmail.com",
    sameAs: ["https://github.com/YoonsooKim9"],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
