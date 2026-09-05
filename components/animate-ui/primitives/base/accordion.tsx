'use client';

import * as React from 'react';
import { Accordion as AccordionPrimitive } from '@base-ui-components/react/accordion';
import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';

import { getStrictContext } from '@/lib/get-strict-context';
import { useControlledState } from '@/hooks/use-controlled-state';

type AccordionContextType = {
  value: string | string[] | undefined;
  setValue: (value: string | string[] | undefined) => void;
};

type AccordionItemContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const [AccordionProvider, useAccordion] =
  getStrictContext<AccordionContextType>('AccordionContext');

const [AccordionItemProvider, useAccordionItem] =
  getStrictContext<AccordionItemContextType>('AccordionItemContext');

type AccordionProps = React.ComponentProps<typeof AccordionPrimitive.Root>;

function Accordion(props: AccordionProps) {
  const [value, setValue] = useControlledState<string | string[] | undefined>({
    value: props?.value,
    defaultValue: props?.defaultValue,
    onChange: props?.onValueChange as (
      value: string | string[] | undefined,
    ) => void,
  });

  return (
    <AccordionProvider value={{ value, setValue }}>
      <AccordionPrimitive.Root
        data-slot="accordion"
        {...props}
        onValueChange={setValue}
      />
    </AccordionProvider>
  );
}

type AccordionItemProps = React.ComponentProps<typeof AccordionPrimitive.Item>;

function AccordionItem(props: AccordionItemProps) {
  const { value, setValue } = useAccordion();
  const isOpen = Array.isArray(value)
    ? value.includes(props?.value as string)
    : value === props?.value;

  const setIsOpen = React.useCallback((open: boolean) => {
    if (!props?.value) return;
    const itemVal = props.value as string;
    if (Array.isArray(value)) {
      if (open && !value.includes(itemVal)) {
        setValue([...value, itemVal]);
      } else if (!open && value.includes(itemVal)) {
        setValue(value.filter(v => v !== itemVal));
      }
    } else {
      setValue(open ? itemVal : undefined);
    }
  }, [value, props?.value, setValue]);

  return (
    <AccordionItemProvider value={{ isOpen, setIsOpen }}>
      <AccordionPrimitive.Item data-slot="accordion-item" {...props} />
    </AccordionItemProvider>
  );
}

type AccordionHeaderProps = React.ComponentProps<
  typeof AccordionPrimitive.Header
>;

function AccordionHeader(props: AccordionHeaderProps) {
  return <AccordionPrimitive.Header data-slot="accordion-header" {...props} />;
}

type AccordionTriggerProps = React.ComponentProps<
  typeof AccordionPrimitive.Trigger
>;

function AccordionTrigger(props: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Trigger data-slot="accordion-trigger" {...props} />
  );
}

type AccordionPanelProps = Omit<
  React.ComponentProps<typeof AccordionPrimitive.Panel>,
  'keepMounted' | 'render'
> &
  HTMLMotionProps<'div'> & {
    keepRendered?: boolean;
  };

function AccordionPanel({
  transition = { duration: 0.35, ease: 'easeInOut' },
  hiddenUntilFound,
  keepRendered = false,
  ...props
}: AccordionPanelProps) {
  const { isOpen } = useAccordionItem();

  return (
    <AnimatePresence>
      {keepRendered ? (
        <AccordionPrimitive.Panel
          hidden={false}
          hiddenUntilFound={hiddenUntilFound}
          keepMounted
          render={
            <motion.div
              key="accordion-panel"
              data-slot="accordion-panel"
              initial={{ height: 0, opacity: 0, y: 20 }}
              animate={
                isOpen
                  ? { height: 'auto', opacity: 1, y: 0 }
                  : { height: 0, opacity: 0, y: 20 }
              }
              transition={transition}
              style={{
                overflow: 'hidden',
              }}
              {...props}
            />
          }
        />
      ) : (
        isOpen && (
          <AccordionPrimitive.Panel
            hidden={false}
            hiddenUntilFound={hiddenUntilFound}
            keepMounted
            render={
              <motion.div
                key="accordion-panel"
                data-slot="accordion-panel"
                initial={{ height: 0, opacity: 0, y: 20 }}
                animate={{
                  height: 'auto',
                  opacity: 1,
                  y: 0,
                }}
                exit={{ height: 0, opacity: 0, y: 20 }}
                transition={transition}
                style={{
                  overflow: 'hidden',
                }}
                {...props}
              />
            }
          />
        )
      )}
    </AnimatePresence>
  );
}

export {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
  useAccordionItem,
  type AccordionProps,
  type AccordionItemProps,
  type AccordionHeaderProps,
  type AccordionTriggerProps,
  type AccordionPanelProps,
  type AccordionItemContextType,
};
