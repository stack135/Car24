pipeline {
    agent any

    triggers {
        githubPush()
    }

    stages {
        stage('Run Docker Compose') {
            steps {
                sh 'docker compose down'
                sh 'docker compose up -d --build'
            }
        }
    }
}