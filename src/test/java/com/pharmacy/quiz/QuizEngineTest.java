package com.pharmacy.quiz;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

public class QuizEngineTest {

    public static void main(String[] args) {
        System.out.println("Running QuizEngineTest...");
        try {
            // Test generation of Quiz 1
            testQuizGeneration(1);

            // Test generation of Quiz 2
            testQuizGeneration(2);

            System.out.println("All tests passed!");
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void testQuizGeneration(int quizNumber) throws Exception {
        System.out.println("Testing Quiz " + quizNumber + " generation...");

        // Run the QuizEngine
        QuizEngine.main(new String[]{String.valueOf(quizNumber)});

        File quizFile = new File("generated-quiz-" + quizNumber + ".json");
        if (!quizFile.exists()) {
            throw new RuntimeException("Quiz file was not generated: " + quizFile.getName());
        }

        ObjectMapper mapper = new ObjectMapper();
        QuizEngine.Quiz quiz = mapper.readValue(quizFile, QuizEngine.Quiz.class);

        // Only enforce size check for Quiz 1 since we only have data for Lab 2 Quiz 1
        // Lab 2 Quiz 2 data is missing, so we can't select 6 new items for it.
        // We expect only 4 items (from Lab 1) for Quiz 2 if Lab 2 Quiz 2 is empty.
        if (quizNumber == 1 && quiz.pools.easy.size() != 10) {
            throw new RuntimeException("Quiz 1 should have 10 items, found " + quiz.pools.easy.size());
        }

        // Verify rules
        for (QuizEngine.Question q : quiz.pools.easy) {
            if ("short".equals(q.type)) {
                // Must be brand-generic question
                if (!q.prompt.contains("generic name") && !q.prompt.contains("brand name")) {
                     throw new RuntimeException("Short question should be about brand/generic: " + q.prompt);
                }
            } else if ("mcq".equals(q.type)) {
                // Should be Class or Category (or MOA if implemented)
                // We check that choices are present
                if (q.choices == null || q.choices.size() < 2) {
                    throw new RuntimeException("MCQ should have choices: " + q.prompt);
                }
            }
        }

        // Cleanup
        quizFile.delete();
        System.out.println("Quiz " + quizNumber + " verified successfully.");
    }
}
