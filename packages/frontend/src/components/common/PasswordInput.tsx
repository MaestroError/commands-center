import { useState, type InputHTMLAttributes } from "react";

import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputClassName = className ? `cc-input pr-11 ${className}` : "cc-input pr-11";

  return (
    <div className="relative">
      <input {...props} className={inputClassName} type={visible ? "text" : "password"} />
      <button
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-text-muted transition hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
      </button>
    </div>
  );
}
