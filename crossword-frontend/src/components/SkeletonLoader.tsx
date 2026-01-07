interface SkeletonProps {
    className?: string;
    style?: React.CSSProperties;
}

export function SkeletonLoader({ className = '', style = {} }: SkeletonProps) {
    return (
        <div className={`skeleton-loader ${className}`} style={style} />
    );
}

export function SkeletonPuzzleCard() {
    return (
        <div className="puzzle-card skeleton-card">
            <SkeletonLoader style={{ height: '24px', width: '70%', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
                <SkeletonLoader style={{ height: '36px', width: '80px', borderRadius: '8px' }} />
                <SkeletonLoader style={{ height: '36px', width: '80px', borderRadius: '8px' }} />
            </div>
        </div>
    )
}
