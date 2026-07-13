'use client';
import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'motion/react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FileUpload({
	onChange,
	accept,
	className,
	disabled,
}: {
	onChange: (files: File[]) => void;
	accept?: string;
	className?: string;
	disabled?: boolean;
}) {
	const [isDragActive, setIsDragActive] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFiles = (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return;
		onChange(Array.from(fileList));
	};

	const handleDrop = (e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragActive(false);
		if (disabled) return;
		handleFiles(e.dataTransfer.files);
	};

	return (
		<div
			className={cn(
				'relative rounded-lg border-2 border-dashed border-input bg-card/50 p-10 text-center transition-colors cursor-pointer',
				isDragActive && 'border-primary bg-primary/5',
				disabled && 'opacity-50 cursor-not-allowed',
				className
			)}
			onClick={() => !disabled && inputRef.current?.click()}
			onDragOver={(e) => {
				e.preventDefault();
				if (!disabled) setIsDragActive(true);
			}}
			onDragLeave={() => setIsDragActive(false)}
			onDrop={handleDrop}
		>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				disabled={disabled}
				className="hidden"
				onChange={(e) => handleFiles(e.target.files)}
			/>
			<motion.div
				animate={{ scale: isDragActive ? 1.05 : 1 }}
				transition={{ duration: 0.15 }}
				className="flex flex-col items-center gap-3"
			>
				<UploadCloud className="h-8 w-8 text-muted-foreground" />
				<p className="text-sm font-medium text-foreground">
					{isDragActive ? 'Drop the file here' : 'Drag & drop a file here, or click to browse'}
				</p>
				<p className="text-xs text-muted-foreground">Uploads go directly to your project's ingestion pipeline.</p>
			</motion.div>
		</div>
	);
}
