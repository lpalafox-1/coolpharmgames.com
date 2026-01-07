package com.pharmacy.quiz;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

public class QuizEngine {

    private static final String MASTER_POOL_FILE = "master_pool.json";

    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println("Usage: java com.pharmacy.quiz.QuizEngine <QuizNumber>");
            System.exit(1);
        }

        int quizNumber = Integer.parseInt(args[0]);
        System.out.println("Generating Quiz " + quizNumber + "...");

        try {
            List<Drug> masterPool = loadMasterPool();
            Quiz quiz = generateQuiz(masterPool, quizNumber);

            int total = quiz.pools.lab1.size() + quiz.pools.lab2.size();
            System.out.println("Generated quiz with " + total + " total questions in pools.");

            saveQuiz(quiz, quizNumber);

        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static List<Drug> loadMasterPool() throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        return mapper.readValue(new File(MASTER_POOL_FILE), new TypeReference<List<Drug>>(){});
    }

    private static Quiz generateQuiz(List<Drug> masterPool, int quizNumber) {
        Quiz quiz = new Quiz();
        quiz.id = "generated-quiz-" + quizNumber;
        quiz.title = "Generated Quiz " + quizNumber;
        quiz.pools = new Pools();
        quiz.blueprint = new HashMap<>();

        // Logic for source pools
        List<Drug> lab2Pool = masterPool.stream()
                .filter(d -> d.metadata.lab == 2 && d.metadata.quiz == quizNumber)
                .collect(Collectors.toList());

        List<Drug> lab1Pool;
        if (quizNumber == 1) {
            // Lab 1 Weeks 1-3
            lab1Pool = masterPool.stream()
                .filter(d -> d.metadata.lab == 1 && d.metadata.week >= 1 && d.metadata.week <= 3)
                .collect(Collectors.toList());
        } else if (quizNumber == 2) {
            // Lab 1 Weeks 4-6
            lab1Pool = masterPool.stream()
                .filter(d -> d.metadata.lab == 1 && d.metadata.week >= 4 && d.metadata.week <= 6)
                .collect(Collectors.toList());
        } else {
             // Default fallback for other quizzes (e.g. cumulative)
             lab1Pool = masterPool.stream()
                .filter(d -> d.metadata.lab == 1 && d.metadata.quiz <= quizNumber)
                .collect(Collectors.toList());
        }

        // Add to pools
        quiz.pools.lab2 = generateQuestions(lab2Pool);
        quiz.pools.lab1 = generateQuestions(lab1Pool);

        // Create blueprint for 'easy' mode
        List<BlueprintRule> rules = new ArrayList<>();
        rules.add(new BlueprintRule("lab2", 6));
        rules.add(new BlueprintRule("lab1", 4));
        quiz.blueprint.put("easy", rules);

        return quiz;
    }

    private static List<Question> generateQuestions(List<Drug> drugs) {
        List<Question> questions = new ArrayList<>();
        for (Drug drug : drugs) {
            // Generate questions based on rules
            List<String> questionTypes = new ArrayList<>();
            if (drug.brand != null) {
                questionTypes.add("brand-generic");
                questionTypes.add("generic-brand");
            }
            if (drug.drugClass != null) questionTypes.add("class");
            if (drug.category != null) questionTypes.add("category");
            if (drug.moa != null) questionTypes.add("moa");

            if (questionTypes.isEmpty()) continue;

            // Generate ALL possible question types for the pool to maximize variety?
            // Or just one random per drug?
            // If we want randomization per attempt, having multiple questions per drug is better.
            // But let's stick to 1 per drug for now to avoid bloating, or maybe 2.
            // Let's generate 1 random one for now.
            String type = questionTypes.get(new Random().nextInt(questionTypes.size()));

            Question q = null;
            switch (type) {
                case "brand-generic":
                    q = createShortQuestion("What is the generic name for " + drug.brand + "?", drug.generic);
                    break;
                case "generic-brand":
                    q = createShortQuestion("What is the brand name for " + drug.generic + "?", drug.brand);
                    break;
                case "class":
                    q = createMCQ("Which class does " + drug.generic + " belong to?", drug.drugClass, getFakeClasses(drug.drugClass));
                    break;
                case "category":
                    q = createMCQ("What is the category of " + drug.generic + "?", drug.category, getFakeCategories(drug.category));
                    break;
                case "moa":
                    q = createMCQ("What is the MOA of " + drug.generic + "?", drug.moa, getFakeMOAs(drug.moa));
                    break;
            }

            if (q != null) {
                q.mapping = new HashMap<>();
                q.mapping.put("generic", drug.generic);
                if (drug.brand != null) q.mapping.put("brand", drug.brand);
                if (drug.drugClass != null) q.mapping.put("class", drug.drugClass);
                if (drug.category != null) q.mapping.put("category", drug.category);
                questions.add(q);
            }
        }
        return questions;
    }

    private static Question createShortQuestion(String prompt, String answer) {
        Question q = new Question();
        q.type = "short";
        q.prompt = prompt;
        q.answerText = Arrays.asList(answer.toLowerCase());
        return q;
    }

    private static Question createMCQ(String prompt, String answer, List<String> distractors) {
        Question q = new Question();
        q.type = "mcq";
        q.prompt = prompt;
        q.answer = Arrays.asList(answer);

        List<String> choices = new ArrayList<>(distractors);
        choices.add(answer);
        Collections.shuffle(choices);
        q.choices = choices;

        return q;
    }

    private static List<String> getFakeClasses(String realClass) {
        List<String> all = new ArrayList<>(Arrays.asList(
            "ACE inhibitor", "Angiotensin II Receptor Blocker", "Beta-1 selective blocker",
            "Calcium channel blocker (dihydropyridine)", "Calcium channel blocker (non-dihydropyridine)",
            "Thiazide diuretic", "Loop diuretic", "Aldosterone receptor antagonist",
            "HMG-CoA reductase inhibitor", "Fibric acid derivative"
        ));
        Collections.shuffle(all);
        return all.stream().filter(c -> !c.equals(realClass)).limit(3).collect(Collectors.toList());
    }

    private static List<String> getFakeCategories(String realCategory) {
        List<String> all = new ArrayList<>(Arrays.asList("Antihypertensive", "Antilipemic", "Anticoagulant", "Antiarrhythmic"));
        Collections.shuffle(all);
        return all.stream().filter(c -> !c.equals(realCategory)).limit(3).collect(Collectors.toList());
    }

    private static List<String> getFakeMOAs(String realMoa) {
        List<String> all = new ArrayList<>(Arrays.asList(
            "Inhibits conversion of angiotensin I to angiotensin II",
            "Blocks angiotensin II from binding to its receptor",
            "Inhibits Na+/Cl- reabsorption in the distal tubule",
            "Inhibits Na+/Cl-/K+ reabsorption in the loop of Henle",
            "Blocks calcium channels in vascular smooth muscle",
            "Competes with aldosterone in the distal tubule"
        ));
        Collections.shuffle(all);
        return all.stream().filter(c -> !c.equals(realMoa)).limit(3).collect(Collectors.toList());
    }

    private static void saveQuiz(Quiz quiz, int quizNumber) throws IOException {
        ObjectMapper mapper = new ObjectMapper();
        mapper.writerWithDefaultPrettyPrinter().writeValue(new File("generated-quiz-" + quizNumber + ".json"), quiz);
        System.out.println("Quiz saved to generated-quiz-" + quizNumber + ".json");
    }

    // Inner classes for JSON mapping
    public static class Drug {
        public String generic;
        public String brand;
        public String drugClass; // JSON field is "class"
        public String category;
        public String moa;
        public Metadata metadata;

        // Setter for JSON "class" field
        public void setClass(String c) { this.drugClass = c; }
        public String getDrugClass() { return drugClass; }
    }

    public static class Metadata {
        public int lab;
        public int quiz;
        public int week;
        public boolean is_new;
    }

    public static class Quiz {
        public String id;
        public String title;
        public Pools pools;
        public Map<String, List<BlueprintRule>> blueprint;
    }

    public static class BlueprintRule {
        public String source;
        public int count;
        public BlueprintRule() {}
        public BlueprintRule(String source, int count) {
            this.source = source;
            this.count = count;
        }
    }

    public static class Pools {
        public List<Question> easy;
        // Dynamic fields for pools
        public List<Question> lab1;
        public List<Question> lab2;
    }

    public static class Question {
        public String type;
        public String prompt;
        public List<String> choices;
        public List<String> answer;
        public List<String> answerText;
        public Map<String, String> mapping;
    }
}
