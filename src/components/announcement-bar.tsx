import { SparkIcon } from "./icons";

/** Thin promo strip above the header. Text is managed from Admin → Settings. */
export function AnnouncementBar({ message }: { message: string }) {
  if (!message.trim()) return null;

  return (
    <div className="bg-espresso-900 text-cream-100">
      <div className="container-page flex items-center justify-center gap-2 py-2 text-center">
        <SparkIcon size={13} className="shrink-0 text-caramel-400" />
        <p className="text-[0.75rem] font-medium leading-snug sm:text-[0.8125rem]">
          {message}
        </p>
      </div>
    </div>
  );
}
