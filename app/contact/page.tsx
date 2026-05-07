import type { Metadata } from "next";

import { ContactClient } from "@/components/contact/ContactClient";

export const metadata: Metadata = {
  title: "연락하기",
  description: "프로젝트 협업 또는 채용 관련 문의를 남겨주세요.",
};

export default function ContactPage() {
  return (
    <ContactClient
      email="bbabi0901@gmail.com"
      github="https://github.com/YoonsooKim9"
    />
  );
}
