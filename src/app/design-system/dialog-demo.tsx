"use client";

import { useState } from "react";
import { Button, Dialog } from "@/components/ui";

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel RSV-7K3Q9?"
        description="The villa becomes bookable again right away. Refund the deposit separately in your payment dashboard."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Cancel booking
            </Button>
          </>
        }
      />
    </>
  );
}
