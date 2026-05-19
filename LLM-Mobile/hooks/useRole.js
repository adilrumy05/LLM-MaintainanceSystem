import { useUser } from '../app/_layout';    // reads from UserContext — no AsyncStorage

export function useRole() {
  const { user, role } = useUser();

  return {
    user,
    role:            role ?? 'beginner',
    loading:         user === undefined,       // true only while context initialises on first launch
    isAdmin:         role === 'admin',
    isExpert:        role === 'expert',
    isIntermediate:  role === 'intermediate',
    isBeginner:      role === 'beginner',
    canApprove:      ['admin', 'expert', 'intermediate'].includes(role),
    canSeeReasoning: ['admin', 'expert'].includes(role),
    canSeeAgents:    ['admin', 'expert'].includes(role),
    needsGuidance:   ['beginner', 'intermediate'].includes(role),
    isJunior:        role === 'beginner',
  };
}