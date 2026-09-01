export function postHasMedia(post: {
  caption?: string | null;
  media_assets?: Array<{ type: string }>;
}): boolean {
  return Boolean(post.media_assets?.length);
}

export function StoryPublishCheckbox({
  checked,
  disabled,
  onChange,
  className = '',
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 text-xs text-ink ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-line-strong"
      />
      <span>También colgar como historia (24 h)</span>
    </label>
  );
}
