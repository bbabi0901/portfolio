import type { Metadata } from "next";

import { ContactClient } from "@/components/contact/ContactClient";

export const metadata: Metadata = {
  title: "연락하기",
  description: "김윤수에게 메시지를 남기거나 메일로 직접 연락하세요.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <ContactClient
      email="bbabi0901@gmail.com"
      github="https://github.com/YoonsooKim9"
    />
  );
}
