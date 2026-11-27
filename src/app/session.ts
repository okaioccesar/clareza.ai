/** The signed-in person's display info, set by the account module. */
export const profile = {
  name: '',
  get firstName(): string {
    const first = this.name.trim().split(/\s+/)[0] || '';
    return first.includes('@') ? '' : first;
  },
};

export const LOCKED_EVENT = 'clareza:workspace-locked';
export const PROFILE_EVENT = 'clareza:profile';
