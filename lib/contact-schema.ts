import { z } from "zod";

export const ContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "이름을 입력해 주세요")
    .max(40, "이름은 40자 이하"),
  email: z
    .string()
    .trim()
    .email("올바른 이메일 형식이 아니에요"),
  message: z
    .string()
    .trim()
    .min(10, "메시지는 10자 이상")
    .max(2000, "메시지는 2000자 이하"),
  // honeypot: 사람에게 보이지 않는 필드. 봇이 채우면 거부.
  website: z
    .string()
    .max(0, "비워두세요")
    .optional()
    .or(z.literal("")),
});

export type ContactInput = z.infer<typeof ContactSchema>;
