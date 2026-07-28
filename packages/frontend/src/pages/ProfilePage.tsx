import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";

import { PasswordInput } from "@/components/common/PasswordInput";
import { PageHeader } from "@/components/common/PageHeader";
import { useTheme } from "@/context/use-theme";
import { useOwnerAuth } from "@/context/use-owner-auth";
import { changeOwnerPassword } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";

const MIN_PASSWORD_LENGTH = 10;
const UPPERCASE_LETTER_PATTERN = /[A-Z]/;
const LOWERCASE_LETTER_PATTERN = /[a-z]/;
const NUMBER_PATTERN = /\d/;
const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

export function ProfilePage() {
  const { theme } = useTheme();
  const auth = useOwnerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);

  async function onLogout(): Promise<void> {
    setLogoutError(null);
    setLogoutSubmitting(true);

    try {
      await auth.logout();
      queryClient.clear();
      void navigate("/login", { replace: true, state: { from: location } });
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "Unable to sign out.");
    } finally {
      setLogoutSubmitting(false);
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const validationError = validatePasswordForm({
      currentPassword,
      newPassword,
      confirmNewPassword,
    });

    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setPasswordSubmitting(true);

    try {
      await changeOwnerPassword({ currentPassword, newPassword, confirmNewPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess("Password changed. Other browser sessions were signed out.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Unable to change password.");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        description="Choose your workspace theme here. Color mode is controlled separately from the header."
        eyebrow="Profile"
        title="Personalize your workspace"
      />
      <section className="cc-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary">Theme</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Themes define the visual character across light and dark modes. Default is the only
          available theme today.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className={theme === "default" ? "cc-tab cc-tab-active" : "cc-tab"}>Default</span>
        </div>
      </section>
      <section className="cc-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary">Owner password</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Change the password for this workspace owner. Use at least 10 characters, including
          uppercase, lowercase, a number, and a symbol. Avoid common or reused passwords.
        </p>
        <form
          className="mt-5 grid gap-4 sm:max-w-xl"
          onSubmit={(event) => void onChangePassword(event)}
        >
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Current password
            <PasswordInput
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              value={currentPassword}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            New password
            <PasswordInput
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              required
              value={newPassword}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Confirm new password
            <PasswordInput
              autoComplete="new-password"
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              required
              value={confirmNewPassword}
            />
          </label>
          <p className="text-xs leading-5 text-text-secondary">
            Passwords must be at least {MIN_PASSWORD_LENGTH.toString()} characters and include
            uppercase, lowercase, a number, and a symbol.
          </p>
          {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
          {passwordSuccess ? <p className="text-sm text-success">{passwordSuccess}</p> : null}
          <div>
            <Button disabled={passwordSubmitting} type="submit">
              {passwordSubmitting ? "Changing password..." : "Change password"}
            </Button>
          </div>
        </form>
      </section>
      <section className="cc-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary">Owner session</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Sign out of this browser without changing the workspace owner password.
        </p>
        <Button
          variant="secondary"
          className="mt-5"
          disabled={logoutSubmitting}
          onClick={() => void onLogout()}
          type="button"
        >
          {logoutSubmitting ? "Signing out..." : "Sign out"}
        </Button>
        {logoutError ? <p className="mt-3 text-sm text-danger">{logoutError}</p> : null}
      </section>
    </div>
  );
}

function validatePasswordForm(input: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): string | null {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH.toString()} characters.`;
  }

  if (input.newPassword !== input.confirmNewPassword) {
    return "New password confirmation must match.";
  }

  if (input.currentPassword === input.newPassword) {
    return "New password must be different from the current password.";
  }

  if (!UPPERCASE_LETTER_PATTERN.test(input.newPassword)) {
    return "New password must include at least one uppercase letter.";
  }

  if (!LOWERCASE_LETTER_PATTERN.test(input.newPassword)) {
    return "New password must include at least one lowercase letter.";
  }

  if (!NUMBER_PATTERN.test(input.newPassword)) {
    return "New password must include at least one number.";
  }

  if (!SYMBOL_PATTERN.test(input.newPassword)) {
    return "New password must include at least one symbol.";
  }

  return null;
}
