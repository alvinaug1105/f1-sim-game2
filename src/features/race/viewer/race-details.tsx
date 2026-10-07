"use client";
import type { ReactNode } from 'react';
import { Icon } from '../../../components/ui/icon';

/** Secondary information only. Native disclosure semantics; Escape closes it and restores its summary's focus. */
export function RaceDetails({ title, children, className = '' }: { title: ReactNode; children: ReactNode; className?: string }) {
    return <details className={`race-detail ${className}`.trim()} onKeyDown={event => {
        if (event.key === 'Escape' && event.currentTarget.open) {
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
        }
    }}>
        <summary>{title}<Icon name="chevron" size={12}/></summary>
        <div className="race-detail-body">{children}</div>
    </details>;
}
