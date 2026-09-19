/** The tenant root. Every other row in the system hangs off one of these. */
export interface Organization {
	id: string;
	name: string;
	plan: string;
	createdAt: Date;
}
