import { createContext, useContext, useState, ReactNode } from 'react';

interface EditModeContextValue {
  editModeEnabled: boolean;
  toggleEditMode: () => void;
  setEditMode: (enabled: boolean) => void;
}

const EditModeContext = createContext<EditModeContextValue | undefined>(undefined);

interface EditModeProviderProps {
  children: ReactNode;
}

/**
 * EditModeProvider - Manages global edit mode state
 * Allows admins/editors to toggle edit UI on/off
 */
export function EditModeProvider({ children }: EditModeProviderProps) {
  const [editModeEnabled, setEditModeEnabled] = useState(false);

  const toggleEditMode = () => {
    setEditModeEnabled(prev => !prev);
  };

  const setEditMode = (enabled: boolean) => {
    setEditModeEnabled(enabled);
  };

  return (
    <EditModeContext.Provider value={{ editModeEnabled, toggleEditMode, setEditMode }}>
      {children}
    </EditModeContext.Provider>
  );
}

/**
 * useEditMode hook - Access edit mode state
 * @returns EditModeContextValue
 * @throws Error if used outside EditModeProvider
 */
export const useEditMode = (): EditModeContextValue => {
  const context = useContext(EditModeContext);

  if (context === undefined) {
    throw new Error('useEditMode must be used within EditModeProvider');
  }

  return context;
};
