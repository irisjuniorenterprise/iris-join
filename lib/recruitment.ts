export function getRecruitmentWindow() {
  const open = process.env.NEXT_PUBLIC_RECRUITMENT_OPEN
    ? new Date(process.env.NEXT_PUBLIC_RECRUITMENT_OPEN)
    : null;
  const close = process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE
    ? new Date(process.env.NEXT_PUBLIC_RECRUITMENT_CLOSE)
    : null;

  return { open, close };
}

export type RecruitmentState = "not-started" | "open" | "closed";

export function getRecruitmentState(now = new Date()): RecruitmentState {
  const { open, close } = getRecruitmentWindow();

  if (open && now < open) return "not-started";
  if (close && now > close) return "closed";
  return "open";
}
