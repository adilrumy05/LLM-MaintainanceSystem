import React from "react";
import { View, Text, StyleSheet, Button, TouchableOpacity } from "react-native";

export default function ExpertScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Expert Dashboard</Text>
      <Text style={styles.subHeader}>
        You have full access to the RAG system, maintenance logs, and task execution.
      </Text>

      {/* Query RAG System */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Query Manuals</Text>
        <Text style={styles.cardText}>
          Search through technical manuals using the RAG pipeline.
        </Text>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Open Query Tool</Text>
        </TouchableOpacity>
      </View>

      {/* Update Maintenance Logs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Maintenance Logs</Text>
        <Text style={styles.cardText}>
          Add or update logs for completed tasks and inspections.
        </Text>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Update Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Execute Disassembly Tasks */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Disassembly Tasks</Text>
        <Text style={styles.cardText}>
          Access detailed step-by-step instructions and execute tasks.
        </Text>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Start Task</Text>
        </TouchableOpacity>
      </View>

      <Button
        title="Log Out"
        color="#d9534f"
        onPress={async () => {
          await AsyncStorage.removeItem('user');

          navigation.replace("Login");
        }}
      />
    </View>
      
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f4f6f9",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subHeader: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
    color: "#555",
  },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});


