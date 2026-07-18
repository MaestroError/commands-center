import { cva } from "class-variance-authority";

export const buttonVariants = cva("cc-button", {
  variants: {
    variant: {
      primary: "",
      secondary: "cc-button-secondary",
      danger: "cc-button-danger",
    },
    size: {
      default: "",
      icon: "cc-button-icon",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "default",
  },
});
