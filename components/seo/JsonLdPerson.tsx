export function JsonLdPerson() {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "김윤수",
    alternateName: "Yoonsoo Kim",
    jobTitle: "프론트엔드 개발자",
    description: "프론트엔드 + 스마트컨트랙트 개발자",
    email: "mailto:bbabi0901@gmail.com",
    url,
    sameAs: ["https://github.com/YoonsooKim9"],
    knowsAbout: [
      "Frontend Development",
      "TypeScript",
      "React",
      "Next.js",
      "Module Federation",
      "Smart Contracts",
      "Solidity",
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
