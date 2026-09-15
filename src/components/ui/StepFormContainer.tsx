import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Step {
    id: string;
    label: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
    completed?: boolean;
    fields?: string[];
}

interface StepFormContainerProps {
    steps: Step[];
    activeStep: number;
    onStepChange: (index: number) => void;
    footer?: React.ReactNode;
    stepErrors?: boolean[];
    isMobile?: boolean;
}

export function StepFormContainer({
    steps,
    activeStep,
    onStepChange,
    footer,
    stepErrors = [],
    isMobile = false,
}: StepFormContainerProps) {
    const totalSteps = steps.length;
    const scrollRef = useRef<HTMLDivElement>(null);
    const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
    const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
    const prevStepRef = useRef(activeStep);

    // Track scroll availability on mobile stepper
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollIndicators = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setCanScrollLeft(scrollLeft > 6);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
    }, []);

    // Track direction of step change for smooth slide animations
    useEffect(() => {
        if (activeStep > prevStepRef.current) {
            setTransitionDirection('forward');
        } else if (activeStep < prevStepRef.current) {
            setTransitionDirection('backward');
        }
        prevStepRef.current = activeStep;
    }, [activeStep]);

    // Auto-scroll active step into view on mobile without causing page vertical shifts
    useEffect(() => {
        if (scrollRef.current) {
            const container = scrollRef.current;
            const activeElement = container.children[activeStep] as HTMLElement | undefined;
            if (activeElement) {
                const targetScroll = activeElement.offsetLeft - (container.clientWidth / 2) + (activeElement.offsetWidth / 2);
                container.scrollTo({
                    left: Math.max(0, targetScroll),
                    behavior: 'smooth',
                });
            }
        }
        updateScrollIndicators();
    }, [activeStep, updateScrollIndicators]);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        container.addEventListener('scroll', updateScrollIndicators, { passive: true });
        window.addEventListener('resize', updateScrollIndicators);
        return () => {
            container.removeEventListener('scroll', updateScrollIndicators);
            window.removeEventListener('resize', updateScrollIndicators);
        };
    }, [updateScrollIndicators]);

    // Touch swipe gesture handlers for mobile APK (Capacitor) / mobile browser
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        const target = e.target as HTMLElement | null;

        // Skip swiping if gesture originates inside interactive form fields or inner scroll containers
        if (
            target &&
            (target.closest('input, textarea, select, button, [role="slider"], [data-no-swipe]') ||
                target.closest('.overflow-x-auto:not([data-allow-swipe])') ||
                target.closest('table'))
        ) {
            touchStartPos.current = null;
            return;
        }

        touchStartPos.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now(),
        };
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartPos.current) return;
        const touch = e.changedTouches[0];
        if (!touch) {
            touchStartPos.current = null;
            return;
        }

        const deltaX = touch.clientX - touchStartPos.current.x;
        const deltaY = touch.clientY - touchStartPos.current.y;
        const elapsed = Date.now() - touchStartPos.current.time;
        touchStartPos.current = null;

        // Ensure clear horizontal intent:
        // 1. Horizontal distance >= 48px
        // 2. Horizontal distance > Vertical distance * 1.45 (prevent hijacking vertical form scroll)
        // 3. Gesture completed within 750ms
        if (elapsed < 750 && Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.45) {
            if (deltaX < 0) {
                // Swiped Left -> Advance to next step
                if (activeStep < totalSteps - 1) {
                    setTransitionDirection('forward');
                    onStepChange(activeStep + 1);
                }
            } else {
                // Swiped Right -> Return to previous step
                if (activeStep > 0) {
                    setTransitionDirection('backward');
                    onStepChange(activeStep - 1);
                }
            }
        }
    };

    return (
        <div className="w-full select-none md:select-auto">
            {/* Desktop stepper header */}
            <div className="hidden md:block mb-8 bg-card border border-border/80 rounded-2xl p-4 sm:px-6 shadow-xs overflow-x-auto [scrollbar-width:none]">
                <div className="flex items-start justify-between min-w-full">
                    {steps.map((step, idx) => {
                        const isCurrent = idx === activeStep;
                        const isCompleted = idx < activeStep;
                        const hasError = stepErrors?.[idx];

                        return (
                            <React.Fragment key={step.id}>
                                <button
                                    type="button"
                                    onClick={() => onStepChange(idx)}
                                    className="group flex flex-col items-center gap-1.5 text-center transition-all p-1 rounded-xl hover:bg-muted/40 shrink-0 focus-visible:outline-none"
                                >
                                    <span
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-full border-2 font-bold text-xs transition-all duration-200',
                                            hasError && isCompleted
                                                ? 'border-destructive bg-destructive/15 text-destructive'
                                                : isCompleted
                                                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                                                : isCurrent
                                                ? 'border-primary bg-primary/15 text-primary shadow-xs ring-4 ring-primary/20 scale-105'
                                                : 'border-border bg-muted/40 text-muted-foreground group-hover:border-border/80'
                                        )}
                                    >
                                        {isCompleted ? (
                                            hasError ? <XCircle className="h-4 w-4" /> : <Check className="h-4 w-4 stroke-[2.5]" />
                                        ) : (
                                            idx + 1
                                        )}
                                    </span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                            Step {idx + 1}
                                        </span>
                                        <span
                                            className={cn(
                                                'text-[11px] sm:text-xs transition-colors whitespace-nowrap px-1 max-w-[5.5rem] sm:max-w-[7rem] truncate',
                                                isCurrent
                                                    ? 'font-bold text-foreground'
                                                    : isCompleted
                                                    ? 'font-medium text-foreground/80'
                                                    : 'font-medium text-muted-foreground'
                                            )}
                                            title={step.label}
                                        >
                                            {step.label}
                                        </span>
                                    </div>
                                </button>
                                {idx < totalSteps - 1 && (
                                    <div className="h-0.5 flex-1 mx-1 sm:mx-2.5 bg-muted relative overflow-hidden rounded-full mt-4 min-w-3">
                                        <div
                                            className={cn(
                                                'absolute inset-0 bg-primary transition-all duration-300',
                                                idx < activeStep ? 'w-full' : 'w-0'
                                            )}
                                        />
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Mobile dynamic swipeable stepper */}
            <div className="md:hidden mb-4 space-y-2.5">
                {/* Step indicator info & swipe affordance badge */}
                <div className="flex items-center justify-between px-1 text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        Step {activeStep + 1} of {totalSteps}:{' '}
                        <span className="text-primary font-medium">{steps[activeStep]?.label}</span>
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground/80 flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-full border border-border/50">
                        <span>Swipe</span>
                        <span className="text-[11px] font-bold text-primary">‹ ›</span>
                    </span>
                </div>

                {/* Animated progress bar */}
                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.round(((activeStep + 1) / totalSteps) * 100)}%` }}
                    />
                </div>

                {/* Horizontal scrollable step pills with overflow fade masks */}
                <div className="relative -mx-2 px-2">
                    {/* Left edge fade */}
                    <div
                        className={cn(
                            "absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
                            canScrollLeft ? "opacity-100" : "opacity-0"
                        )}
                    />
                    {/* Right edge fade */}
                    <div
                        className={cn(
                            "absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
                            canScrollRight ? "opacity-100" : "opacity-0"
                        )}
                    />

                    <div
                        ref={scrollRef}
                        className="flex items-center gap-1.5 py-1 overflow-x-auto scroll-smooth touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {steps.map((step, idx) => {
                            const isCurrent = idx === activeStep;
                            const isCompleted = idx < activeStep;
                            const hasError = stepErrors?.[idx];

                            return (
                                <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => onStepChange(idx)}
                                    className={cn(
                                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95',
                                        isCurrent
                                            ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                            : hasError && isCompleted
                                            ? 'bg-destructive/10 text-destructive border border-destructive/30'
                                            : isCompleted
                                            ? 'bg-muted/80 text-foreground'
                                            : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                                            isCurrent
                                                ? 'bg-primary-foreground text-primary'
                                                : isCompleted
                                                ? hasError
                                                    ? 'bg-destructive text-destructive-foreground'
                                                    : 'bg-primary/20 text-primary'
                                                : 'bg-muted text-muted-foreground'
                                        )}
                                    >
                                        {isCompleted ? (
                                            hasError ? <XCircle className="h-3 w-3" /> : <Check className="h-3 w-3" />
                                        ) : (
                                            idx + 1
                                        )}
                                    </span>
                                    <span className="whitespace-nowrap">{step.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Step Content with Touch Swipe & Hardware-Accelerated Directional Transition */}
            <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="md:rounded-2xl md:border md:bg-card md:overflow-hidden md:shadow-xs"
            >
                {steps.map((step, idx) => {
                    const isActive = idx === activeStep;
                    if (!isActive) {
                        return (
                            <div
                                key={step.id}
                                style={{ display: 'none' }}
                                aria-hidden="true"
                            >
                                {step.content}
                            </div>
                        );
                    }

                    return (
                        <div
                            key={step.id}
                            className={cn(
                                "w-full transition-all duration-200 ease-out",
                                "animate-in fade-in-50",
                                transitionDirection === 'forward' ? "slide-in-from-right-3" : "slide-in-from-left-3"
                            )}
                            style={{ willChange: 'transform, opacity' }}
                        >
                            {step.content}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            {footer && <div className="mt-6">{footer}</div>}
        </div>
    );
}