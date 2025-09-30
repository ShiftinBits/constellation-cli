// Sample TypeScript file for testing
export interface User {
	id: string;
	name: string;
	email: string;
	createdAt: Date;
}

export class UserService {
	private users: Map<string, User> = new Map();

	constructor() {
		console.log('UserService initialized');
	}

	addUser(user: User): void {
		this.users.set(user.id, user);
	}

	getUser(id: string): User | undefined {
		return this.users.get(id);
	}

	getAllUsers(): User[] {
		return Array.from(this.users.values());
	}

	deleteUser(id: string): boolean {
		return this.users.delete(id);
	}
}

export function createUser(name: string, email: string): User {
	return {
		id: Math.random().toString(36),
		name,
		email,
		createdAt: new Date(),
	};
}

export const DEFAULT_USER: User = {
	id: 'default',
	name: 'Default User',
	email: 'default@example.com',
	createdAt: new Date('2024-01-01'),
};