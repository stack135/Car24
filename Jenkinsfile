pipeline {
    agent any

    triggers {
        githubPush()
    }

    stages {
        stage('Run Docker Compose') {
            steps {
                sh 'docker-compose down'
                sh 'docker-compose up -d --build'
            }
        }
    }

    post {
        success {
            echo 'Build Success 🎉'
            mail to: 'team_r.d@stackenzo.com',
                 subject: "✅ SUCCESS: ${env.JOB_NAME}",
                 body: "Build succeeded! Check Jenkins: ${env.BUILD_URL}"
        }

        failure {
            echo 'Build Failed ❌'
            mail to: 'team_r.d@stackenzo.com',
                 subject: "❌ FAILURE: ${env.JOB_NAME}",
                 body: "Build failed! Check logs: ${env.BUILD_URL}"
        }
    }
}