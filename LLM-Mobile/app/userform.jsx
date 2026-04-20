import React, { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, SafeAreaView, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useRouter, useLocalSearchParams } from "expo-router";

const ROLE_CONFIG = {
  admin:               { label: "Admin",        color: "#7c3aed", bg: "#ede9fe" },
  worker_expert:       { label: "Expert",       color: "#7c3aed", bg: "#ede9fe" },
  worker_intermediate: { label: "Intermediate", color: "#7c3aed", bg: "#ede9fe" },
  worker_beginner:     { label: "Beginner",     color: "#7c3aed", bg: "#ede9fe" },
};

const roles = [
  { id: "worker_beginner",     label: "Beginner" },
  { id: "worker_intermediate", label: "Intermediate" },
  { id: "worker_expert",       label: "Expert" },
  { id: "admin",               label: "Admin" },
];

export default function UserFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const existingUser = params.user ? JSON.parse(params.user) : null;

  const [email, setEmail]       = useState(existingUser?.email || "");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(existingUser?.username || "");
  const [role, setRole]         = useState(existingUser?.role_id || "worker_beginner");

  const addUser = async () => {
    if (!username.trim() || !email.trim() || (!existingUser && !password.trim())) {
      Alert.alert("Validation", "Please fill in all required fields.");
      return;
    }
    try {
      if (existingUser) {
        await setDoc(doc(db, "Users", existingUser.id), { username, email, role_id: role });
        Alert.alert("Success", "User updated successfully!");
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        await setDoc(doc(db, "Users", uid), { username, email, role_id: role });
        Alert.alert("Success", "User created successfully!");
      }
      router.back();
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const isEditing = !!existingUser;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color="#7c3aed" />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topLabel}>MANAGEMENT</Text>
            <Text style={styles.topTitle}>{isEditing ? "Edit User" : "New User"}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Form Card */}
        <View style={styles.card}>

          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Username</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={15} color="#7c3aed" style={styles.inputIcon} />
              <TextInput
                placeholder="Enter username"
                placeholderTextColor="#c4b5fd"
                value={username}
                onChangeText={setUsername}
                style={styles.input}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={15} color="#7c3aed" style={styles.inputIcon} />
              <TextInput
                placeholder="Enter email"
                placeholderTextColor="#c4b5fd"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          </View>

          {/* Password */}
          {!isEditing && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={15} color="#7c3aed" style={styles.inputIcon} />
                <TextInput
                  placeholder="Enter password"
                  placeholderTextColor="#c4b5fd"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                />
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* Role Selector */}
          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.roleGrid}>
            {roles.map((r) => {
              const isSelected = role === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.roleChip,
                    isSelected && styles.roleChipSelected,
                  ]}
                  onPress={() => setRole(r.id)}
                  activeOpacity={0.75}
                >
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={13} color="#7c3aed" />
                  )}
                  <Text style={[styles.roleChipText, isSelected && styles.roleChipTextSelected]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveBtn} onPress={addUser} activeOpacity={0.85}>
          <Ionicons name={isEditing ? "save-outline" : "person-add-outline"} size={18} color="#fff" />
          <Text style={styles.saveBtnText}>{isEditing ? "Save Changes" : "Create User"}</Text>
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:            { flex: 1, backgroundColor: "#f5f3ff" },
  container:           { flex: 1, backgroundColor: "#f5f3ff" },
  scrollContent:       { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  topBar:              { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  backBtn:             { width: 36, height: 36, borderRadius: 10, backgroundColor: "#ede9fe", borderWidth: 1, borderColor: "#ddd6fe", alignItems: "center", justifyContent: "center" },
  topCenter:           { flex: 1, alignItems: "center" },
  topLabel:            { fontSize: 10, color: "#7c3aed", letterSpacing: 1.2, fontWeight: "700" },
  topTitle:            { fontSize: 18, fontWeight: "700", color: "#1e1b4b" },
  card:                { backgroundColor: "#ffffff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#ede9fe", marginBottom: 16, elevation: 1 },
  fieldGroup:          { marginBottom: 14 },
  fieldLabel:          { fontSize: 11, color: "#7c3aed", letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase", fontWeight: "700" },
  inputWrapper:        { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f3ff", borderRadius: 10, borderWidth: 1, borderColor: "#ddd6fe", paddingHorizontal: 12, height: 48 },
  inputIcon:           { marginRight: 8 },
  input:               { flex: 1, color: "#1e1b4b", fontSize: 14 },
  divider:             { height: 1, backgroundColor: "#ede9fe", marginVertical: 16 },
  roleGrid:            { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  roleChip:            { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#ddd6fe", backgroundColor: "#f5f3ff" },
  roleChipSelected:    { backgroundColor: "#ede9fe", borderColor: "#7c3aed" },
  roleChipText:        { fontSize: 12, fontWeight: "600", color: "#c4b5fd" },
  roleChipTextSelected:{ color: "#7c3aed" },
  saveBtn:             { backgroundColor: "#7c3aed", borderRadius: 14, height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  saveBtnText:         { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  cancelBtn:           { alignItems: "center", paddingVertical: 10 },
  cancelBtnText:       { color: "#7c3aed", fontSize: 14, fontWeight: "600" },
});


