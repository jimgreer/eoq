interface Props {
  rect: DOMRect;
  onComment: () => void;
}

export function SelectionPopover({ rect, onComment }: Props) {
  const top = rect.top + window.scrollY - 40;
  const left = rect.left + window.scrollX + rect.width / 2;

  return (
    <div
      className="selection-popover"
      style={{ top, left }}
      onMouseDown={e => {
        e.preventDefault(); // Prevent losing selection
        onComment();
      }}
    >
      Add comment
    </div>
  );
}
