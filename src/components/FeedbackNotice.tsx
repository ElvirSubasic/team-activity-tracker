type Props = {
  message: string | null;
  variant?: "error" | "success" | "info";
};

export function FeedbackNotice({ message, variant = "info" }: Props) {
  if (!message) {
    return null;
  }

  return <p className={`notice-toast notice-${variant}`}>{message}</p>;
}
