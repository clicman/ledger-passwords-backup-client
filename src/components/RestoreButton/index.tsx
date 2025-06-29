import React, { useRef, useCallback, useState } from "react";

interface RestoreButtonProps {
  text: string;
  color: string;
  disabled: boolean;
  hidden: boolean;
  onClick: (metadatas: string) => Promise<void>;
}

function RestoreButton({ text, color, disabled, hidden, onClick }: RestoreButtonProps) {
  const [isLoading, setLoading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const hasFileInputBeenCanceled = (): void => {
    if (!file.current?.value.length) setLoading(false);
    document.body.onfocus = null;
  };

  const onTriggerFileSelect = useCallback(() => {
    setLoading(true);
    document.body.onfocus = hasFileInputBeenCanceled;
    file.current && file.current.click();
  }, []);

  const onSelectedFileChanged = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        file.text().then((text) => {
          event.target.value = "";
          onClick(text).then(() => setLoading(false));
        });
      }
    },
    [onClick]
  );

  return (
    <button
      className="RestoreButton"
      disabled={isLoading || disabled}
      onClick={isLoading ? undefined : onTriggerFileSelect}
      style={{
        margin: "10px",
        backgroundColor: color,
        display: hidden ? "none" : "block",
      }}
    >
      {isLoading ? "Loading…" : text}
      <input
        type="file"
        ref={file}
        onChange={onSelectedFileChanged}
        accept=".json"
        style={{ display: "none" }}
      />
    </button>
  );
}

export default RestoreButton; 