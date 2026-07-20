import { forwardRef, useState, type InputHTMLAttributes } from "react";

import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, disabled, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          className={cn("pr-11", className)}
          disabled={disabled}
          type={visible ? "text" : "password"}
        />
        <Button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="cc-password-toggle"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          size="icon"
          variant="secondary"
        >
          {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </Button>
      </div>
    );
  },
);
