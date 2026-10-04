"use client";

import * as React from "react";
import { Toaster as SonnerToaster } from "sonner";

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

const Toaster = (props: ToasterProps) => {
  return <SonnerToaster theme="light" className="toaster group" {...props} />;
};

export { Toaster };
