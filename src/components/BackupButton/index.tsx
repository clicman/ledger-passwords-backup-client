import React, { useState, useCallback } from "react";

interface BackupButtonProps {
  text: string;
  color: string;
  disabled: boolean;
  hidden: boolean;
  onClick: () => Promise<any>;
}

function downloadFile(fileData: any): void {
  const blob = new Blob([JSON.stringify(fileData, null, 4)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const elem = document.createElement("a");
  elem.href = url;
  elem.download = "backup.json";
  document.body.appendChild(elem);
  elem.click();
  document.body.removeChild(elem);
}

function BackupButton({ text, color, disabled, hidden, onClick }: BackupButtonProps) {
  const [isLoading, setLoading] = useState(false);

  const onTriggerRunThenSaveFile = useCallback(() => {
    setLoading(true);
    onClick().then((fileData) => {
      if (fileData) downloadFile(fileData);
      setLoading(false);
    });
  }, [onClick]);

  return (
    <button
      className="BackupButton"
      disabled={isLoading || disabled}
      onClick={isLoading ? undefined : onTriggerRunThenSaveFile}
      style={{
        margin: "10px",
        backgroundColor: color,
        display: hidden ? "none" : "block",
      }}
    >
      {isLoading ? "Loading…" : text}
    </button>
  );
}

export default BackupButton; 