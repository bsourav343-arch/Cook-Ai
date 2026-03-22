export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  subscriptionStatus: 'free' | 'monthly' | 'yearly';
  subscriptionExpiry?: string;
  createdAt?: string;
}

export interface Recipe {
  id: string;
  userId: string;
  dishName: string;
  ingredients: string[];
  instructions: string[];
  cookingTime?: string;
  detectedIngredients?: string[];
  imageUrl?: string;
  createdAt: string;
}

export interface HistoryItem {
  id: string;
  userId: string;
  detectedIngredients: string[];
  imageUrl?: string;
  createdAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
